import type { Screen } from "@google/stitch-sdk"
import { b, ToolType, type LLMResponse, type Message, type Question, type ToolCall } from "../baml_client"
import type { MainAgentResponse, SSEBody } from "../types/mainAgentTypes"
import { COMPACT_CONTEXT_PROMPT, MAIN_AGENT_SUMMARY_PROMPT, MAIN_SYSTEM_PROMPT, SUMMARIZE_CONTEXT_PROMPT } from "./config/sysPrompts"
import { BACKEND_URL, COMPACT_THRESHOLD, COMPACTION_PARAMETER, MAX_MAIN_ITERATIONS } from "./config/systemConfig"
import { webScrape } from "./MCPs/apify"
import { fetchDocs } from "./MCPs/context7"
import { webSearch } from "./MCPs/tavily"
import { makeOneScreen } from "./tools/stitch"
import { encoding_for_model } from "tiktoken"
import { R2 } from "./services/file-storage/fileStorage"
import axios from "axios"

import { E2BSandbox } from "./utils/sandbox"
export class MainAgent{
    public iterations: number
    public masterContext: string
    public lastCompactedIndex: number
    public K: number

    public sandbox: E2BSandbox
    public r2: R2
    constructor(
        public userPrompt: string,
        public userId: string,
        public projectId: string,
        public semanticMem: string, // any semantic data about the user. 
        public session: Message[],
        public context: Message[],
        public sandboxId: string,
    ){ 
        this.iterations = 0
        this.masterContext = ""
        this.lastCompactedIndex = 0
        this.K = COMPACTION_PARAMETER
        this.r2 = new R2()
        this.sandbox = new E2BSandbox()
    }
    async spawnMainAgent(){
        this.runLoop()
        // push to github
    }
    async runLoop(): Promise<MainAgentResponse>{
        /* Steps: 
        - frame prompt
        - fetch context 
        - parse skills 
        - make LLM calls
        - spin up a sandbox 
        - execute tool calls if any, write into sandbox if needed.
        - store regular snapshot of sandbox in file storage
        - loop this thing

        -------updated flow of main agent --------
        - share the relevant memory along with user propmt
        - do the LLM call, assuming system prompt to be too much mature
        - execute whatever is the tool call
            - Sandbox tools would be read, write, bash, edit, 
            - sync with R2. 
            - and MCPs with proper documentation what to call with all the 
                parameteres 
            - normal tools qna tool

        - always share the update to the backend
        - update the context and memory
        - can we push to github after each iteration of the loop? 
        - 
        */

        try{
            while(this.iterations < MAX_MAIN_ITERATIONS){
                let iterationLog: Message[] = []
                
                const response: LLMResponse = await this.callLLM(this.userPrompt);
                
                await this.emitSSEUpdate({
                    type: 'llm_response',
                    content: response.content,
                    iteration: this.iterations
                })
                iterationLog.push({
                    role: "assistant",
                    content: response.content,
                    timestamp: new Date().toISOString()
                })
    
                if(response.stopReason === 'completed') {
                    await this.emitSSEUpdate({
                        type: 'completed',
                        iteration: this.iterations
                    })
                    break;
                }
                if(response.stopReason === 'aborted'){
                    await this.emitSSEUpdate({
                        type: 'aborted',
                        iteration: this.iterations
                    })
                    break;
                }
    
                if(response.stopReason === 'QnA'){
                    if(!response.questions) throw new Error("LLM failed to generate question")
                    const questions: Question[] = response.questions
                    await this.emitSSEUpdate({
                        type: 'clarification_needed',
                        content: JSON.stringify(questions),
                        iteration: this.iterations
                    })
                    // render these questions to frontend
                }
    
                if(response.stopReason === 'toolCall'){
                    if(!response.toolCall){
                        throw new Error("Tool call not sended by LLM")
                    }
                    await this.emitSSEUpdate({
                        type: 'tool_call',
                        content: response.toolCall.type,
                        iteration: this.iterations
                    })
                    const toolResult: string | Screen = await this.executeTool(response?.toolCall)
                    await this.emitSSEUpdate({
                        type: 'tool_result',
                        content: JSON.stringify(toolResult),
                        iteration: this.iterations
                    })
                    iterationLog.push({
                        role: 'toolCall',
                        content: JSON.stringify(toolResult),
                        timestamp: new Date().toISOString()
    
                    })
                    
                }
    
                // update the context and session
                iterationLog.map((log) =>{
                    this.session.push(log)
                    this.context.push(log)
                })
    
                await this.saveSessionState(this.iterations)   // write to Postgres — failure recovery
                this.iterations++
            }
        }
        catch(e){
            console.error(e)
            return{
                success: false,
                summary: `Main Agent failed with error, ${e}`
            }
        }
        return {
            success: true,
            summary: await this.BuildSummary()
        }

        // save session somewhere so that I've conversation somewhere. 
    }
    async callLLM(userPrompt: string): Promise<LLMResponse>{
        try{
            const response: LLMResponse = await b.MainLLMCall(MAIN_SYSTEM_PROMPT, userPrompt, this.context, this.semanticMem)
            return response
        }
        catch(e){
            console.error(e)
            throw e
        }
    }
    async manageContext(): Promise<Message[]>{
        if(this.estimateTokens(this.context) <= COMPACT_THRESHOLD) return this.context

        const len = this.context.length
        const olderHalf = this.context.slice(0, len/2)
        const olderHalfContext = {

        }
        const olderCompacted: Message[] = await b.CompactContext(COMPACT_CONTEXT_PROMPT, olderHalf)
        const updated: Message[] = [...olderCompacted, ...this.context.slice(len/2, len)]
        if(this.estimateTokens(updated) <= COMPACT_THRESHOLD) return updated

        return await b.SummarizeContext(SUMMARIZE_CONTEXT_PROMPT, this.context)
    }
    estimateTokens(context: Message[]): number {
        const encoder = encoding_for_model("gpt-4o")
        return encoder.encode(context.map(m => m.content).join('')).length
    }
    async syncToR2(path: string, content: string){
        const key = this.r2.filesPrefix(this.userId, this.projectId)

        try{
            await this.r2.putFile(key + path, content)
        }
        catch(e){
            console.error(e)
            throw e
        }
    }
    async emitSSEUpdate(event: SSEBody){
        await axios.post(`${BACKEND_URL}/internal/sessions/${this.projectId}/events`, event)
    }
    async saveSessionState(currentStep: number){
        await axios.post(`${BACKEND_URL}/internal/sessions/${this.projectId}/state`, {
            current_step: currentStep,
            context_snapshot: this.context,
            session_snapshot: this.session,
            iteration: this.iterations,
        })
    }

    async executeTool(toolCall: ToolCall): Promise<string | Screen> {

        switch (toolCall.type) {
            case ToolType.Apify:
                if (!toolCall.apify) throw new Error("Apify tool call missing params")
                return await webScrape(toolCall.apify.urls, toolCall.apify.maxPages)

            case ToolType.Context7:
                if (!toolCall.context7) throw new Error("Context7 tool call missing params")
                return await fetchDocs(toolCall.context7.library, toolCall.context7.query)

            case ToolType.Tavily:
                if (!toolCall.tavily) throw new Error("Tavily tool call missing params")
                return await webSearch(toolCall.tavily.query, toolCall.tavily.maxResults)
                break

            case ToolType.Stitch:
                if (!toolCall.stitch) throw new Error("Stitch tool call missing params")
                return await makeOneScreen(toolCall.stitch.prompt, toolCall.stitch.userId)

            case ToolType.ReadFile:
                if (!toolCall.readFile) throw new Error("ReadFile tool call missing params")
                return (await this.sandbox.Execute(this.sandboxId, {action: "read", path: toolCall.readFile.path})).content

            case ToolType.WriteFile:
                if (!toolCall.writeFile) throw new Error("WriteFile tool call missing params")
                return (await this.sandbox.Execute(this.sandboxId, {action: "writeFile", path: toolCall.writeFile.path, content: toolCall.writeFile.content})).content

            case ToolType.EditFile:
                if (!toolCall.editFile) throw new Error("EditFile tool call missing params")
                return (await this.sandbox.Execute(this.sandboxId, {action: "writeFile", path: toolCall.editFile.fileName, content: toolCall.editFile.content})).content

            case ToolType.DeleteFile:
                if (!toolCall.deleteFile) throw new Error("DeleteFile tool call missing params")
                return (await this.sandbox.Execute(this.sandboxId, {action: "delete", path: toolCall.deleteFile.path})).content

            case ToolType.RunCommand:
                if (!toolCall.runCommand) throw new Error("RunCommand tool call missing params")
                return (await this.sandbox.Execute(this.sandboxId, {action: "runCommand", command: toolCall.runCommand.command})).content

            default: throw new Error(`Unhandled tool type: ${toolCall.type}`)
        }
    }
    async BuildSummary(): Promise<string> {
        try {
            return await b.GenerateMainAgentSummary(MAIN_AGENT_SUMMARY_PROMPT, this.context)
        } catch (e) {
            console.error("Error occurred while generating summary")
            throw e
        }
    }

}