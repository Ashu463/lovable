import { b, type CoderContext, type DebuggerContext, type SubAgentsContext, type TaskSummary, type ResearcherContext, type TesterContext } from "../baml_client";
import { CoderAgent } from "./subagents/coder";
import { DebuggerAgent } from "./subagents/debugger";
import { Researcher } from "./subagents/researcher";
import { TesterAgent, type TesterResponse } from "./subagents/tester";

import type { BaseAgent } from "./subagents/baseAgent";
import { CODER_MAX_ITERATIONS, COMPACT_THRESHOLD, DEBUGGERR_MAX_ITERATIONS, RESEARCHER_MAX_ITERATIONS, TESTER_MAX_ITERATIONS, UI_EXPERT_MAX_ITERATIONS, SUBAGENT_LLM_RETRY_ATTEMPTS, SUBAGENT_TOOL_RETRY_ATTEMPTS, SUBAGENT_RETRY_BACKOFF_MS } from "./config/systemConfig";
import { encoding_for_model } from "tiktoken";
import { CoderContextManager, ContextManager, DebuggerContextManager } from "./utils/context";
import { SUBAGENT_SUMMARY_PROMPT } from "./config/systemPrompts";
import type { BaseTaskInput, DebuggerTaskInput, SessionMap, InputMap, ContextMap, Role, Status, SubAgentResponse } from "../types/subAgentsTypes";
import { UIExpert } from "./subagents/uiExpert";
import { E2BSandbox } from "./utils/sandbox";
import { createRunEmitter, type EventEmitter } from "./events";
import { backendGql, SAVE_RUN_STATE } from "./utils/backendClient";
import { logger } from "./utils/logger";
import { SkillStore } from "./skills";

export class SubAgent<T extends keyof ContextMap> {
    private agentInstance: BaseAgent<InputMap[T], ContextMap[T], any, any>
    private context!:  ContextMap[T] // FIX: please fix this '!' where I'm assuming this context array would never ever be null
    private session: SessionMap[T][] = []
    private iteration: number = 0
    private contextManager?: ContextManager<ContextMap[T]>
    private taskId: number
    private repoTree: string = ""
    private emitter: EventEmitter
    private skillStore: SkillStore = new SkillStore()
    constructor(
        private agentType: T,
        private input: InputMap[T],
        private userId: string,
        private projectId: string,
        private runId: string,
        private sandbox: E2BSandbox,
        private selectedDesign: string,
        private baseDir: string,
    ) {
        this.agentInstance = this.createAgent(agentType)
        this.contextManager = this.createContextManager()
        this.taskId = (this.input as BaseTaskInput).task.taskId
        this.emitter = createRunEmitter(runId)
    }

    private createAgent(agentType: T): BaseAgent<any, any, any, any> {
        switch (agentType) {
        case 'coder': return new CoderAgent(this.userId, this.projectId, this.sandbox, this.selectedDesign, this.baseDir) as any
        case 'researcher': return new Researcher(this.userId, this.projectId, this.sandbox) as any
        case 'debuggerr': return new DebuggerAgent(this.userId, this.projectId, this.sandbox, this.baseDir) as any
        case 'tester': return new TesterAgent(this.userId, this.projectId, this.sandbox) as any
        case 'uiExpert': return new UIExpert(this.userId, this.projectId, this.sandbox, this.baseDir) as any
        default: throw new Error(`${agentType} doesn't exist`)
        }
    }
    private createContextManager(){
        switch(this.agentType){
            case 'coder': return new CoderContextManager() as any
            case 'debuggerr': return new DebuggerContextManager() as any
            default: return undefined
        }
    }

    private isSingleShotAgent(): boolean {
        return this.agentType === 'tester' || this.agentType === 'researcher'
    }

    private summarizeToolCall(res: any): string {
        if (!res || typeof res !== 'object') return String(res)
        if (res.path) return `${res.action}:${res.path}`
        if (res.command) return `${res.action}:${res.command}`
        if (res.filesEdited) return `${res.action} (${res.filesEdited.length} file(s))`
        return String(res.action ?? 'unknown')
    }

    private async withRetry<T>(label: string, maxAttempts: number, fn: () => Promise<T>): Promise<T> {
        let lastError: unknown
        for(let attempt = 1; attempt <= maxAttempts; attempt++){
            try{
                return await fn()
            }
            catch(e){
                lastError = e
                logger.warn(`${label} failed (attempt ${attempt}/${maxAttempts}) for ${this.agentType} task ${this.taskId}: ${e instanceof Error ? e.message : String(e)}`)
                if(attempt < maxAttempts){
                    await new Promise((resolve) => setTimeout(resolve, SUBAGENT_RETRY_BACKOFF_MS * attempt))
                }
            }
        }
        throw lastError
    }

    private async haltTask(reason: string): Promise<SubAgentResponse> {
        logger.error(`${this.agentType} task ${this.taskId} halted: ${reason}`)
        this.pushSession('assistant', 'halted', { reason })
        await this.SaveSessionState()
        return { success: false, summary: await this.BuildSummary() }
    }

    async runLoop(): Promise<SubAgentResponse> {
        this.context = await this.BuildInitialContext()
        let success = true

        logger.info(`calling LLM for ${this.agentType}`)
        while (true) {
            let res
            try{
                res = await this.withRetry('LLM call', SUBAGENT_LLM_RETRY_ATTEMPTS, () => this.agentInstance.callLLM(this.input, this.context))
            }
            catch(e){
                return await this.haltTask(`LLM call failed after ${SUBAGENT_LLM_RETRY_ATTEMPTS} attempts: ${e instanceof Error ? e.message : String(e)}`)
            }
            logger.info(`${this.agentType} task ${this.taskId} iter ${this.iteration} -> ${this.summarizeToolCall(res)}`)
            if (this.isSingleShotAgent() || res.action === 'done') {
                logger.info(`${this.agentType} done`)
                let toolRes
                try{
                    toolRes = await this.withRetry('tool call', SUBAGENT_TOOL_RETRY_ATTEMPTS, () => this.agentInstance.executeFunction(res))
                }
                catch(e){
                    return await this.haltTask(`Final tool call failed after ${SUBAGENT_TOOL_RETRY_ATTEMPTS} attempts: ${e instanceof Error ? e.message : String(e)}`)
                }
                this.pushSession('assistant', 'done', toolRes)
                await this.SaveSessionState()
                break
            }

            if(res.action === 'abort'){
                logger.warn(`${this.agentType} aborted at iteration ${this.iteration}: ${res.reason}`)
                this.pushSession('assistant', 'halted', res)
                await this.SaveSessionState()
                success = false
                break;
            }
            // logger.info(`${this.agentType} tool call: ${this.summarizeToolCall(res)}`)
            let toolRes
            try{
                toolRes = await this.withRetry('tool call', SUBAGENT_TOOL_RETRY_ATTEMPTS, () => this.agentInstance.executeFunction(res))
            }
            catch(e){
                return await this.haltTask(`Tool call failed after ${SUBAGENT_TOOL_RETRY_ATTEMPTS} attempts: ${e instanceof Error ? e.message : String(e)}`)
            }
            // Tool results are frequently whole file bodies — log the outcome
            // and a short excerpt, not the payload.
            const toolText = JSON.stringify(toolRes)
            logger.info(`tool result (${toolRes?.success === false ? 'failed' : 'ok'}): ${toolText.length > 300 ? toolText.slice(0, 300) + `... [${toolText.length - 300} more chars]` : toolText}`)
            this.pushSession('assistant', 'in_progress', res)
            this.pushSession('tool', 'done', toolRes)

            this.context = await this.ManageContext(res, toolRes)
            await this.emitSSEUpdate(toolRes)
            this.SaveSessionState().catch(err => logger.error(`Failed to save session for task ${this.taskId}: ${err}`))

            this.iteration++
            if (this.iteration >= this.maxIterations()) {
                success = false
                break
            }
        }

        return {
            success,
            summary: await this.BuildSummary()
        }
    }
    async Test(): Promise<TesterResponse>{
        const tester = new TesterAgent(this.userId, this.projectId, this.sandbox)
        return await tester.testCodebase(await this.BuildTesterContext())
    }
    pushSession(role: Role, status: Status, data?: any){
        const entry = {
            taskId: this.taskId,
            role,
            status,
            iterationCount: this.iteration,
            timestamp: new Date().toISOString(),   // per-entry time, not "startedAt"
            ...(this.agentType === 'debuggerr' ? { rawTranscript: data } : { content: data }),
        }
        this.session.push(entry)
    }
    async BuildInitialContext(): Promise<ContextMap[T]>{
        switch(this.agentType){
            case 'coder': return await this.BuildCoderContext() as ContextMap[T]
            case 'debuggerr': return await this.BuildDebuggerContext() as ContextMap[T]
            case 'researcher': return await this.BuildResearcherContext() as ContextMap[T]
            case 'tester': return {} as ContextMap[T]
            case 'uiExpert': return await this.BuildUIExpertContext() as ContextMap[T]
            default: throw new Error(`No such context builder for ${this.agentType}`)
        }
    }
    private async buildToolLoopContext(role: 'coder' | 'uiExpert'): Promise<CoderContext> {
        const dependentTaskIds = (this.input as BaseTaskInput).task.dependentTasks
        if(this.repoTree === ""){
            this.repoTree = await this.sandbox.getRepoTree(this.baseDir)
        }
        const res = await backendGql<{summaries: {summary: string, todo: {taskId: number}}[]}>(
            `query Summaries($projectId: ID!, $runId: ID!) {
                summaries(projectId: $projectId, runId: $runId) { summary todo { taskId } }
            }`,
            { projectId: this.projectId, runId: this.runId }
        )
        const summaries: TaskSummary[] = res.summaries
            .filter(s => dependentTaskIds.includes(s.todo.taskId))
            .map(s => ({ taskId: String(s.todo.taskId), summary: s.summary }))

        const skills = [
            ...(await this.skillStore.globalSkills(role)),
            ...(await this.skillStore.getRoleSkills(role)),
            ...(await this.skillStore.getTaskCatalog(role)),
        ]
        return { task: (this.input as BaseTaskInput).task.task, dependentSummary: summaries, repoTree: this.repoTree, skills: skills, recentTurns: [] }
    }
    async BuildCoderContext(): Promise<CoderContext>{
        logger.info(`Building context for coder`)
        return this.buildToolLoopContext('coder')
    }
    async BuildDebuggerContext(): Promise<DebuggerContext>{
        if(this.repoTree === ""){
            this.repoTree = await this.sandbox.getRepoTree(this.baseDir)
        }
        const skills = [
            ...(await this.skillStore.globalSkills('debuggerr')),
            ...(await this.skillStore.getRoleSkills('debuggerr')),
            ...(await this.skillStore.getTaskCatalog('debuggerr')),
        ]
        const errors = (this.input as DebuggerTaskInput).errors
        const originalError = errors.length > 0
            ? errors.map(e => `${e.fileName}: ${e.error}`).join('\n')
            : (this.input as BaseTaskInput).task.task
        return {
            repoTree: this.repoTree,
            originalError,
            fixHistory: [],
            skills: skills,
            recentTurns: []
        }
    }
    async BuildTesterContext(): Promise<TesterContext>{
        const skills = [
            ...(await this.skillStore.globalSkills('tester')),
            ...(await this.skillStore.getRoleSkills('tester')),
            ...(await this.skillStore.getTaskSkillsFull('tester')),
        ]
        return { skills }
    }
    async BuildResearcherContext(): Promise<ResearcherContext>{
        const skills = [
            ...(await this.skillStore.globalSkills('researcher')),
            ...(await this.skillStore.getRoleSkills('researcher')),
            ...(await this.skillStore.getTaskSkillsFull('researcher')),
        ]
        return { query: (this.input as BaseTaskInput).task.task, skills }
    }
    async BuildUIExpertContext(): Promise<CoderContext>{
        logger.info(`Building context for uiExpert`)
        return this.buildToolLoopContext('uiExpert')
    }
    private maxIterations(): number {
        switch (this.agentType) {
            case 'debuggerr': return DEBUGGERR_MAX_ITERATIONS
            case 'coder': return CODER_MAX_ITERATIONS
            case 'researcher': return RESEARCHER_MAX_ITERATIONS
            case 'tester': return TESTER_MAX_ITERATIONS
            case 'uiExpert': return UI_EXPERT_MAX_ITERATIONS
        }
    }

    async BuildSummary(): Promise<string> {
        try {
            // #CRITICAL: See session map of baml side and here agent side are not imported from same direction
            // so might cause some issue here.
            // Fix for it is store stringified version of whatever thing you want to save
            return await b.GenerateSubagentSummary(SUBAGENT_SUMMARY_PROMPT, this.agentType, JSON.stringify(this.session))
        } catch (e) {
            logger.error(`Error occurred while generating summary for ${this.agentType}: ${e}`)
            throw e
        }
    }

    // const totalTokens = this.estimateTokens(this.context)
    // if (totalTokens <= COMPACT_THRESHOLD) return this.context
    
    // const compactedContext = await this.contextManager.CompactContext(this.context)
    // const compactedTokens = this.estimateTokens(compactedContext)
    // if (compactedTokens <= COMPACT_THRESHOLD) return compactedContext

    // return await this.contextManager.SummarizeContext(compactedContext)

    async ManageContext(res: any, toolRes: any): Promise<ContextMap[T]> {
        // which is not needed for tester, uiexpert, researcher.
        if(!this.contextManager) return this.context

        const updated = this.contextManager.appendTurn(this.context, res, toolRes)
        
        const tokens = this.estimateTokens(updated)
        if(tokens <= COMPACT_THRESHOLD) return updated

        const compacted = await this.contextManager.CompactContext(updated)
        if(this.estimateTokens(compacted) <= COMPACT_THRESHOLD) return compacted

        return await this.contextManager.SummarizeContext(compacted)
    }
    estimateTokens(context: ContextMap[T]): number{
        const encoder = encoding_for_model("gpt-4o")
        // BUG: stringifying it would skip the undefined fields present in context.
        const num: number = encoder.encode(JSON.stringify(context)).length
        encoder.free()
        return num
    }

    async emitSSEUpdate(data: unknown) {
        await this.emitter.emit({
            type: 'subagent_progress',
            agent: this.agentType,
            taskId: this.taskId,
            data,
        })
    }

    async SaveSessionState() {
        try{
            await backendGql(SAVE_RUN_STATE, {
                runId: this.runId,
                iteration: this.iteration,
                contextSnapshot: JSON.stringify(this.context),
                sessionSnapshot: JSON.stringify(this.session)
            }, 5000)
        } catch(e){
            logger.error(`Failed to save session state for task ${this.taskId}: ${e}`)
        }
    }
}