import type { Screen } from "@google/stitch-sdk"
import { b, type Abort, type Apify, type Context7, type DeleteFile, type Done, type EditFile, type GetSkill, type Message, type ReadFile, type RunCommand, type StitchTool, type Tavily, type WriteFile } from "../baml_client"
import type { MainAgentResponse, SSEBody } from "../types/mainAgentTypes"
import { COMPACT_CONTEXT_PROMPT, MAIN_AGENT_SUMMARY_PROMPT, MAIN_AGENT_SYSTEM_PROMPT, SUMMARIZE_CONTEXT_PROMPT } from "./config/systemPrompts"
import { COMPACT_THRESHOLD, COMPACTION_PARAMETER, MAIN_AGENT_MAX_ITERATIONS, MAIN_AGENT_LLM_RETRY_ATTEMPTS, SUBAGENT_RETRY_BACKOFF_MS, PROJECT_ROOT, SANDBOX_HOME } from "./config/systemConfig"
import { webScrape } from "./MCPs/apify"
import { fetchDocs } from "./MCPs/context7"
import { webSearch } from "./MCPs/tavily"
import { makeOneScreen } from "./tools/stitch"
import { encoding_for_model } from "tiktoken"
import { R2 } from "./services/file-storage/fileStorage"

import { E2BSandbox } from "./utils/sandbox"
import { createRunEmitter, type EventEmitter } from "./events"
import { backendGql, SAVE_RUN_STATE } from "./utils/backendClient"
import { logger } from "./utils/logger"
import { SkillStore } from "./skills"
type SyncR2Request = {action: "write", path: string, content: string} | {action: "delete", path: string}

// Mirrors MainLLMCall's return union in mainAgent.baml — keep the two in sync.
// `Done`/`Abort` are the terminal variants, everything else is a tool call.
type MainLLMResponse = ReadFile | WriteFile | EditFile | DeleteFile | RunCommand | GetSkill | Apify | Context7 | Tavily | StitchTool | Done | Abort
type MainToolCall = Exclude<MainLLMResponse, Done | Abort>
export class MainAgent{
    private iterations: number
    private K: number
    private session: Message[] = []
    private context: Message[] = []
    private static encoder = encoding_for_model("gpt-4o")
    private r2: R2
    private emitter: EventEmitter
    private skillStore: SkillStore = new SkillStore() // I'm injectig skills into system prompt for main agent.

    constructor(
        private userPrompt: string,
        private userId: string,
        private projectId: string,
        private runId: string,
        private semanticMem: string,
        private selectedDesign: string,
        private sandbox: E2BSandbox,
        private orchestratorContext: string,
    ){
        this.iterations = 0
        this.K = COMPACTION_PARAMETER
        this.r2 = new R2()
        this.emitter = createRunEmitter(runId)
        logger.info(`[MainAgent:${this.runId}] Initialized for user=${this.userId} project=${this.projectId}`)
    }

    async buildSystemPrompt(): Promise<string>{
        const global = this.skillStore.renderAsText(await this.skillStore.globalSkills('main'))
        const role = this.skillStore.renderAsText(await this.skillStore.getRoleSkills('main'))
        const taskCatalog = this.skillStore.renderAsText(await this.skillStore.getTaskCatalog('main'))
        return `${global}\n\n${role}\n\n${taskCatalog}`
    }

    private async withRetry<T>(label: string, maxAttempts: number, fn: (priorError?: string) => Promise<T>): Promise<T> {
        let lastError: unknown
        for(let attempt = 1; attempt <= maxAttempts; attempt++){
            try{
                return await fn(lastError instanceof Error ? lastError.message : lastError !== undefined ? String(lastError) : undefined)
            }
            catch(e){
                lastError = e
                logger.warn(`[MainAgent:${this.runId}] ${label} failed (attempt ${attempt}/${maxAttempts}): ${e instanceof Error ? e.message : String(e)}`)
                if(attempt < maxAttempts){
                    await new Promise((resolve) => setTimeout(resolve, SUBAGENT_RETRY_BACKOFF_MS * attempt))
                }
            }
        }
        throw lastError
    }

    async runLoop(): Promise<MainAgentResponse>{
        logger.info(`[MainAgent:${this.runId}] runLoop starting, maxIterations=${MAIN_AGENT_MAX_ITERATIONS}`)
        try{
            const updatedSystemPrompt = MAIN_AGENT_SYSTEM_PROMPT + await this.buildSystemPrompt()
            while(this.iterations < MAIN_AGENT_MAX_ITERATIONS){
                logger.info(`[MainAgent:${this.runId}] Iteration ${this.iterations} starting`)
                let iterationLog: Message[] = [] // things which should collectively present in context as well as session
                let shouldBreak = false

                const response: MainLLMResponse = await this.withRetry(
                    'MainLLMCall',
                    MAIN_AGENT_LLM_RETRY_ATTEMPTS,
                    (priorError) => this.callLLM(updatedSystemPrompt, this.userPrompt, priorError),
                );
                logger.info(`[MainAgent:${this.runId}] Iteration ${this.iterations} LLM action=${response.action}`)

                if(response.action === 'done') {
                    logger.info(`[MainAgent:${this.runId}] LLM signaled completion at iteration ${this.iterations}`)
                    iterationLog.push({
                        role: 'assistant',
                        content: `Task complete. Files edited: ${response.filesEdited.map(f => `${f.fileName} (${f.summary})`).join('; ') || 'none'}`,
                        timestamp: new Date().toISOString()
                    })
                    shouldBreak = true
                }
                else if(response.action === 'abort'){
                    logger.warn(`[MainAgent:${this.runId}] LLM aborted at iteration ${this.iterations}: ${response.reason}`)
                    iterationLog.push({
                        role: 'assistant',
                        content: `Aborted: ${response.reason}`,
                        timestamp: new Date().toISOString()
                    })
                    shouldBreak = true
                }
                else {
                    // Everything else in the union is a tool call, and `action` is
                    // the payload's own discriminator, so there is no separate
                    // label left that can disagree with the args.
                    const toolType = response.action
                    logger.info(`[MainAgent:${this.runId}] Tool call requested: ${toolType}`)
                    const toolRequestLog: Message = {
                        role: 'assistant',
                        content: `Requested tool call ${toolType} with args ${JSON.stringify(response)}`,
                        timestamp: new Date().toISOString()
                    }
                    this.session.push(toolRequestLog)
                    iterationLog.push(toolRequestLog)
                    await this.emitter.emit({
                        type: 'main_agent_tool_call',
                        step: this.iterations,
                        toolName: toolType
                    })
                    try{
                        const toolResult: string | Screen = await this.executeTool(response)
                        logger.info(`[MainAgent:${this.runId}] Tool call ${toolType} succeeded`)
                        iterationLog.push({
                            role: 'toolCall',
                            content: `Result of ${toolType}: ${JSON.stringify(toolResult)}`,
                            timestamp: new Date().toISOString()
                        })
                        // Only reached when executeTool didn't throw, so these run
                        // for writes that actually landed in the sandbox.
                        if(response.action === 'writeFile'){
                            await this.syncToR2({action: "write", path: response.path, content: response.content})
                        }
                        if(response.action === 'editFile'){
                            // An edit has no final content here, so push the project rather than one file.
                            await this.sandbox.SyncR2()
                        }
                        if(response.action === 'delete'){
                            await this.syncToR2({action: "delete", path: response.path})
                        }
                    }catch(e){
                        logger.error(`[MainAgent:${this.runId}] Tool call ${toolType} failed: ${e instanceof Error ? e.message : String(e)}`)
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
                if(shouldBreak){
                    await this.saveSessionState()   // write to Postgres — failure recovery
                    this.iterations++
                    logger.info(`[MainAgent:${this.runId}] runLoop breaking after iteration ${this.iterations}`)
                    break
                }
                this.saveSessionState()   // write to Postgres — failure recovery
                this.iterations++
            }
        }
        catch(e){
            logger.error(`[MainAgent:${this.runId}] runLoop failed at iteration ${this.iterations}: ${e instanceof Error ? e.stack ?? e.message : String(e)}`)
            return{
                success: false,
                summary: `Main Agent failed with error, ${e}`
            }
        }
        logger.info(`[MainAgent:${this.runId}] runLoop finished after ${this.iterations} iterations, building summary`)
        return {
            success: true,
            summary: await this.BuildSummary()
        }
    }

    async callLLM(systemPrompt: string, userPrompt: string, priorError?: string): Promise<MainLLMResponse>{
        try{
            // Feed the previous attempt's validation failure back in as a one-off
            // correction — appended here, not to this.context, so a successful
            // retry doesn't leave a permanent "I messed up" note in history.
            const context = priorError
                ? [...this.context, {
                    role: 'system' as const,
                    content: `Your previous response failed schema validation: ${priorError}. Correct this in your next response — emit exactly one action object with its own fields at the top level, e.g. {"action":"writeFile","path":"...","content":"..."}.`,
                    timestamp: new Date().toISOString(),
                }]
                : this.context

            const response: MainLLMResponse = await b.MainLLMCall(systemPrompt, userPrompt, context, this.semanticMem, this.selectedDesign, this.orchestratorContext)
            return response
        }
        catch(e){
            logger.error(`[MainAgent:${this.runId}] MainLLMCall failed: ${e instanceof Error ? e.message : String(e)}`)
            throw e
        }
    }

    async ManageContext(): Promise<Message[]>{
        const tokens = this.estimateTokens(this.context)
        if(tokens <= COMPACT_THRESHOLD) return this.context
        logger.info(`[MainAgent:${this.runId}] Context at ${tokens} tokens exceeds threshold ${COMPACT_THRESHOLD}, compacting older half`)

        const len = this.context.length
        const olderHalf = this.context.slice(0, len/2)
        const olderCompacted: Message[] = await b.CompactContext(COMPACT_CONTEXT_PROMPT, olderHalf)
        const updated: Message[] = [...olderCompacted, ...this.context.slice(len/2, len)]
        const updatedTokens = this.estimateTokens(updated)
        if(updatedTokens <= COMPACT_THRESHOLD){
            logger.info(`[MainAgent:${this.runId}] Compaction brought context to ${updatedTokens} tokens`)
            return updated
        }

        logger.warn(`[MainAgent:${this.runId}] Compaction insufficient (${updatedTokens} tokens), summarizing full context`)
        return await b.SummarizeContext(SUMMARIZE_CONTEXT_PROMPT, this.context)
    }

    estimateTokens(context: Message[]): number {
        return MainAgent.encoder.encode(context.map(m => m.content).join('')).length
    }

    private r2Key(path: string): string {
        const abs = path.startsWith('/') ? path : `${PROJECT_ROOT}/${path.replace(/^\.\//, '')}`
        return this.r2.filesPrefix(this.userId, this.projectId) + abs.replace(SANDBOX_HOME, '')
    }

    async syncToR2(data: SyncR2Request){
        const key = this.r2Key(data.path)

        if(data.action === 'write'){
            try{
                logger.info(`[MainAgent:${this.runId}] Syncing write to R2: ${data.path}`)
                await this.r2.putFile(key, data.content)
            }
            catch(e){
                logger.error(`[MainAgent:${this.runId}] R2 write failed for ${data.path}: ${e instanceof Error ? e.message : String(e)}`)
                throw e
            }

        }
        else{
            try{
                logger.info(`[MainAgent:${this.runId}] Syncing delete to R2: ${data.path}`)
                await this.r2.deleteFile(key)
            }
            catch(e){
                logger.error(`[MainAgent:${this.runId}] R2 delete failed for ${data.path}: ${e instanceof Error ? e.message : String(e)}`)
                throw e
            }
        }
    }

    async saveSessionState(){
        try{
            await backendGql(SAVE_RUN_STATE, {
                runId: this.runId,
                contextSnapshot: JSON.stringify(this.context),
                sessionSnapshot: JSON.stringify(this.session),
                iteration: this.iterations,
            }, 5000)
            logger.info(`[MainAgent:${this.runId}] Session state saved at iteration ${this.iterations}`)
        } catch(e){
            logger.error(`[MainAgent:${this.runId}] Failed to save session state: ${e instanceof Error ? e.message : String(e)}`)
        }
    }

    // Dispatches on the payload's own `action` literal, so there is no separate
    // discriminator to fall out of sync with the args and no per-case null check
    // — if it parsed as this variant, its fields are present by construction.
    async executeTool(toolCall: MainToolCall): Promise<string | Screen> {
        switch (toolCall.action) {
            case 'apify':
                logger.info(`[MainAgent:${this.runId}] Apify: scraping ${toolCall.urls.length} url(s), maxPages=${toolCall.maxPages}`)
                return await webScrape(toolCall.urls, toolCall.maxPages)

            case 'context7':
                logger.info(`[MainAgent:${this.runId}] Context7: fetching docs for ${toolCall.library}, query="${toolCall.query}"`)
                return await fetchDocs(toolCall.library, toolCall.query)

            case 'tavily':
                logger.info(`[MainAgent:${this.runId}] Tavily: searching "${toolCall.query}", maxResults=${toolCall.maxResults}`)
                return await webSearch(toolCall.query, toolCall.maxResults)

            case 'stitch':
                logger.info(`[MainAgent:${this.runId}] Stitch: generating screen for prompt="${toolCall.prompt}"`)
                return await makeOneScreen(toolCall.prompt, toolCall.userId)

            case 'read':
                logger.info(`[MainAgent:${this.runId}] ReadFile: ${toolCall.path}`)
                return (await this.sandbox.Execute(this.sandbox.sandboxId, toolCall)).content

            // Execute() reports in-sandbox failures via `success`, not by throwing,
            // so these three surface it — otherwise runLoop treats a failed write
            // as a success and syncs stale state to R2.
            case 'writeFile': {
                logger.info(`[MainAgent:${this.runId}] WriteFile: ${toolCall.path}`)
                const res = await this.sandbox.Execute(this.sandbox.sandboxId, toolCall)
                if (!res.success) throw new Error(res.content)
                return res.content
            }

            case 'editFile': {
                logger.info(`[MainAgent:${this.runId}] EditFile: ${toolCall.path}`)
                const res = await this.sandbox.Execute(this.sandbox.sandboxId, toolCall)
                if (!res.success) throw new Error(res.content)
                return res.content
            }

            case 'delete': {
                logger.info(`[MainAgent:${this.runId}] DeleteFile: ${toolCall.path}`)
                const res = await this.sandbox.Execute(this.sandbox.sandboxId, toolCall)
                if (!res.success) throw new Error(res.content)
                return res.content
            }

            case 'runCommand':
                logger.info(`[MainAgent:${this.runId}] RunCommand: ${toolCall.command} (cwd: ${toolCall.cwd ?? "project root"})`)
                return (await this.sandbox.Execute(this.sandbox.sandboxId, toolCall)).content

            case 'getSkill':
                logger.info(`[MainAgent:${this.runId}] GetSkill: ${toolCall.skillName}`)
                return await this.skillStore.fetchSkillContent(toolCall.skillName, 'main')

            default: {
                const unhandled: never = toolCall
                throw new Error(`Unhandled tool action: ${JSON.stringify(unhandled)}`)
            }
        }
    }

    async BuildSummary(): Promise<string> {
        try {
            logger.info(`[MainAgent:${this.runId}] Building summary from ${this.session.length} session entries`)
            return await b.GenerateMainAgentSummary(MAIN_AGENT_SUMMARY_PROMPT, this.session)
        } catch (e) {
            logger.error(`[MainAgent:${this.runId}] Error occurred while generating summary: ${e instanceof Error ? e.message : String(e)}`)
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