import type { Screen } from "@google/stitch-sdk"
import { b, ToolType, type LLMResponse, type Message, type Question, type ToolCall } from "../baml_client"
import type { MainAgentResponse, SSEBody } from "../types/mainAgentTypes"
import { COMPACT_CONTEXT_PROMPT, MAIN_AGENT_SUMMARY_PROMPT, MAIN_AGENT_SYSTEM_PROMPT, SUMMARIZE_CONTEXT_PROMPT } from "./config/sysPrompts"
import { BACKEND_URL, COMPACT_THRESHOLD, COMPACTION_PARAMETER, MAIN_AGENT_MAX_ITERATIONS } from "./config/systemConfig"
import { webScrape } from "./MCPs/apify"
import { fetchDocs } from "./MCPs/context7"
import { webSearch } from "./MCPs/tavily"
import { makeOneScreen } from "./tools/stitch"
import { encoding_for_model } from "tiktoken"
import { R2 } from "./services/file-storage/fileStorage"
import axios from "axios"

import { E2BSandbox } from "./utils/sandbox"
import { createBackendEmitter } from "./events"
type SyncR2Request = {action: "write", path: string, content: string} | {action: "delete", path: string}
export class MainAgent{
    private iterations: number
    private K: number
    private session: Message[] = []
    private context: Message[] = []
    private static encoder = encoding_for_model("gpt-4o")
    private r2: R2
    constructor(
        private userPrompt: string,
        private userId: string,
        private projectId: string,
        private runId: string,
        private semanticMem: string,
        private sandbox: E2BSandbox,
    ){ 
        this.iterations = 0
        this.K = COMPACTION_PARAMETER
        this.r2 = new R2()
    }
    
    async runLoop(): Promise<MainAgentResponse>{
        try{
            while(this.iterations < MAIN_AGENT_MAX_ITERATIONS){
                let iterationLog: Message[] = [] // things which should collectively present in context as well as session
                
                const response: LLMResponse = await this.callLLM(this.userPrompt);
                
                iterationLog.push({
                    role: "assistant",
                    content: response.content,
                    timestamp: new Date().toISOString()
                })
    
                if(response.stopReason === 'completed') {
                    await this.saveSessionState()
                    this.session.push({
                        role: 'assistant',
                        content: `LLM Response completed`,
                        timestamp: new Date().toISOString()
                    })
                    break;
                }
                if(response.stopReason === 'aborted'){
                    await this.saveSessionState()
                    this.session.push({
                        role: 'assistant',
                        content: `LLM call aborted`,
                        timestamp: new Date().toISOString()
                    })
                    break;
                }
    
                // if(response.stopReason === 'QnA'){
                //     if(!response.questions) throw new Error("LLM failed to generate question")
                //     const questions: Question[] = response.questions
                //     await this.emitSSEUpdate({
                //         type: 'clarification_needed',
                //         content: JSON.stringify(questions),
                //         iteration: this.iterations
                //     })
                //     await createBackendEmitter(this.runId).emit({
                //         type:'clarification_needed',
                //         questions: questions.map((m) => m.question)
                //     })
                //     // render these questions to frontend
                // }
    
                if(response.stopReason === 'toolCall'){
                    if(!response.toolCall){
                        throw new Error("Tool call not sended by LLM")
                    }
                    const toolType = response.toolCall.type
                    this.session.push({
                        role: 'assistant',
                        content: `LLM requested tool call for ${toolType}`,
                        timestamp: new Date().toISOString()
                    })
                    await createBackendEmitter(this.runId).emit({
                        type: 'main_agent_tool_call',
                        step: this.iterations,
                        toolName: toolType
                    })
                    try{
                        const toolResult: string | Screen = await this.executeTool(response.toolCall)
                        iterationLog.push({
                            role: 'toolCall',
                            content: JSON.stringify(toolResult),
                            timestamp: new Date().toISOString()
                        })
                        if(response.toolCall.writeFile){
                            await this.syncToR2({action: "write", path: response.toolCall.writeFile.path, content: response.toolCall.writeFile.content})
                        }
                        if(response.toolCall.editFile){
                            await this.syncToR2({action: "write", path: response.toolCall.editFile.path, content: response.toolCall.editFile.content})
                        }
                        if(response.toolCall.deleteFile){
                            await this.syncToR2({action: "delete", path: response.toolCall.deleteFile.path})
                        }
                    }catch(e){
                        iterationLog.push({
                            role: 'toolCall',
                            content: `Tool call ${toolType} failed: ${e instanceof Error ? e.message : String(e)}`,
                            timestamp: new Date().toISOString()
                        })
                    }
                }
    
                // update the context and session
                iterationLog.map((log) =>{
                    this.session.push(log)
                    this.context.push(log)
                })

                this.context = await this.ManageContext()
                this.saveSessionState()   // write to Postgres — failure recovery
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
    }

    async callLLM(userPrompt: string): Promise<LLMResponse>{
        try{
            const response: LLMResponse = await b.MainLLMCall(MAIN_AGENT_SYSTEM_PROMPT, userPrompt, this.context, this.semanticMem)
            return response
        }
        catch(e){
            console.error(e)
            throw e
        }
    }

    async ManageContext(): Promise<Message[]>{
        if(this.estimateTokens(this.context) <= COMPACT_THRESHOLD) return this.context

        const len = this.context.length
        const olderHalf = this.context.slice(0, len/2)
        const olderCompacted: Message[] = await b.CompactContext(COMPACT_CONTEXT_PROMPT, olderHalf)
        const updated: Message[] = [...olderCompacted, ...this.context.slice(len/2, len)]
        if(this.estimateTokens(updated) <= COMPACT_THRESHOLD) return updated

        return await b.SummarizeContext(SUMMARIZE_CONTEXT_PROMPT, this.context)
    }

    estimateTokens(context: Message[]): number {
        return MainAgent.encoder.encode(context.map(m => m.content).join('')).length
    }

    async syncToR2(data: SyncR2Request){
        const key = this.r2.filesPrefix(this.userId, this.projectId)

        if(data.action === 'write'){
            try{
                await this.r2.putFile(key + data.path, data.content)
            }
            catch(e){
                console.error(e)
                throw e
            }

        }
        else{
            try{
                await this.r2.deleteFile(key + data.path)
            }
            catch(e){
                console.error(e)
                throw e
            }
        }
    }
    
    async saveSessionState(){
        await axios.post(`${BACKEND_URL}/internal/sessions/${this.projectId}/state`, {
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

            case ToolType.Stitch:
                if (!toolCall.stitch) throw new Error("Stitch tool call missing params")
                return await makeOneScreen(toolCall.stitch.prompt, toolCall.stitch.userId)

            case ToolType.ReadFile:
                if (!toolCall.readFile) throw new Error("ReadFile tool call missing params")
                return (await this.sandbox.Execute(this.sandbox.sandboxId, {action: "read", path: toolCall.readFile.path})).content

            case ToolType.WriteFile:
                if (!toolCall.writeFile) throw new Error("WriteFile tool call missing params")
                return (await this.sandbox.Execute(this.sandbox.sandboxId, {action: "writeFile", path: toolCall.writeFile.path, content: toolCall.writeFile.content})).content

            case ToolType.EditFile:
                if (!toolCall.editFile) throw new Error("EditFile tool call missing params")
                return (await this.sandbox.Execute(this.sandbox.sandboxId, {action: "writeFile", path: toolCall.editFile.path, content: toolCall.editFile.content})).content

            case ToolType.DeleteFile:
                if (!toolCall.deleteFile) throw new Error("DeleteFile tool call missing params")
                return (await this.sandbox.Execute(this.sandbox.sandboxId, {action: "delete", path: toolCall.deleteFile.path})).content

            case ToolType.RunCommand:
                if (!toolCall.runCommand) throw new Error("RunCommand tool call missing params")
                return (await this.sandbox.Execute(this.sandbox.sandboxId, {action: "runCommand", command: toolCall.runCommand.command})).content

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

/* Discussion
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