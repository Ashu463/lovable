import { b, type CoderContext, type DebuggerContext, type SubAgentsContext, type TaskSummary,  type UIExpertContext } from "../baml_client";
import { CoderAgent } from "./subagents/coder";
import { DebuggerAgent } from "./subagents/debugger";
import { Researcher } from "./subagents/researcher";
import { TesterAgent, type TesterResponse } from "./subagents/tester";

import type { BaseAgent } from "./subagents/baseAgent";
import { BACKEND_URL, CODER_MAX_ITERATIONS, COMPACT_THRESHOLD, DEBUGGERR_MAX_ITERATIONS, MAX_SUBAGENT_ITERATIONS } from "./config/systemConfig";
import { encoding_for_model } from "tiktoken";
import { CoderContextManager, ContextManager, DebuggerContextManager } from "./utils/context";
import { SUBAGENT_SUMMARY_PROPMT } from "./config/sysPrompts";
import type { SSEBody } from "../types/mainAgentTypes";
import axios from "axios";
import type { BaseTaskInput, ResearcherContext, SessionMap, InputMap, ContextMap, Role, Status, SubAgentResponse } from "../types/subAgentsTypes";
import { UIExpert } from "./subagents/uiExpert";
import { E2BSandbox } from "./utils/sandbox";

export class SubAgent<T extends keyof ContextMap> {
    private agentInstance: BaseAgent<InputMap[T], ContextMap[T], any, any>
    private context!:  ContextMap[T] // FIX: please fix this '!' where I'm assuming this context array would never ever be null
    private session: SessionMap[T][] = []
    private iteration: number = 0
    private contextManager?: ContextManager<ContextMap[T]>
    private taskId: number
    private sandbox: E2BSandbox
    private repoTree: string = ""
    constructor(
        public agentType: T,
        public input: InputMap[T],
        public userId: string,
        public projectId: string,
        public sandboxId: string,
        public semanticMem: string,
    ) {
        this.agentInstance = this.createAgent(agentType)
        this.contextManager = this.createContextManager()
        this.taskId = (this.input as BaseTaskInput).task.taskId
        this.sandbox = new E2BSandbox()
    }

    private createAgent(agentType: T): BaseAgent<any, any, any, any> {
        switch (agentType) {
        case 'coder': return new CoderAgent(this.userId, this.projectId, this.sandboxId) as any
        case 'researcher': return new Researcher(this.userId, this.projectId, this.sandboxId) as any
        case 'debuggerr': return new DebuggerAgent(this.userId, this.projectId, this.sandboxId) as any
        case 'tester': return new TesterAgent(this.userId, this.projectId, this.sandboxId) as any
        case 'uiExpert': return new UIExpert(this.userId) as any
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

    async runLoop(): Promise<SubAgentResponse> {
        this.context = await this.BuildInitialContext()

        while (true) {
            const res = await this.agentInstance.callLLM(this.input, this.context)

            if (res.action === 'done' || res.stopReason === 'completed') {
                this.pushSession('assistant', 'done')
                await this.SaveSessionState()
                break
            }
            if(res.stopReason === 'aborted'){
                this.pushSession('assistant', 'halted', res)
                await this.SaveSessionState()
                break;
            }

            const toolRes = await this.agentInstance.executeFunction(res)

            this.pushSession('assistant', 'in_progress', res)
            this.pushSession('tool', 'done', toolRes)

            this.context = await this.ManageContext(toolRes)   

            await this.emitSSEUpdate({
                type: 'tool_result',
                content: JSON.stringify(toolRes),
                iteration: this.iteration,
            })
            this.SaveSessionState().catch(err => console.error(`Failed to save session for task ${this.taskId}`, err))

            if (this.iteration++ > this.maxIterations()) break
        }

        return {
            success: true,
            summary: await this.BuildSummary()
        }
    }
    async Test(): Promise<TesterResponse>{
        const tester = new TesterAgent(this.userId, this.projectId, this.sandboxId)
        return await tester.testCodebase()
    }
    pushSession(role: Role, status: Status, content?: any, rawTranscript?: any){
        const entry = {
            taskId: this.taskId,
            role,
            status,
            iterationCount: this.iteration,
            timestamp: new Date().toISOString(),   // per-entry time, not "startedAt"
            ...(this.agentType === 'debuggerr' ? { rawTranscript } : { content }),
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
    async BuildCoderContext(): Promise<CoderContext>{
        const dependentTaskIds = (this.input as BaseTaskInput).task.dependentTasks
        if(this.repoTree === ""){
            const cwd = await this.sandbox.Execute(this.sandboxId, {action: 'runCommand', command: "find / -name package.json -not -path '*/node_modules/*' | head -1"})
            let root = cwd.stdout?.trim().replace(/\/package\.json$/, "")
            this.repoTree = (await this.sandbox.Execute(this.sandboxId, {action: 'runCommand', command: `cd ${cwd} && tree -I 'node_modules|.git|dist|build'`})).content
        }
        const res = await axios.get(`${BACKEND_URL}/db/fetchSummaries`, {
            params: {dependentTaskIds}
        }) 
        const summaries: TaskSummary[] = res.data
        return { dependentSummary: summaries, repoTree: this.repoTree }
    }
    async BuildDebuggerContext(): Promise<DebuggerContext>{
        return {
            originalError: (this.input as BaseTaskInput).task.task,
            fixHistory: []
        }
    }
    async BuildResearcherContext(): Promise<ResearcherContext>{
        return { query: (this.input as BaseTaskInput).task.task }
    }
    async BuildUIExpertContext(): Promise<UIExpertContext>{
        const priorDesigns = await axios.get(`${BACKEND_URL}/db/fetchPriorDesigns`, {
            params: { projectId: this.projectId }
        })
        return {
            userPrompt: (this.input as BaseTaskInput).task.task,
            priorDesigns: priorDesigns.data
        }
    }
    private maxIterations(): number {
        switch (this.agentType) {
            case 'debuggerr': return DEBUGGERR_MAX_ITERATIONS
            case 'coder': return CODER_MAX_ITERATIONS
            default: return MAX_SUBAGENT_ITERATIONS
        }
    }

    async BuildSummary(): Promise<string> {
        try {
            return await b.GenerateSubagentSummary(SUBAGENT_SUMMARY_PROPMT, this.context as unknown as SubAgentsContext)
        } catch (e) {
            console.error("Error occurred while generating summary")
            throw e
        }
    }

    // const totalTokens = this.estimateTokens(this.context)
    // if (totalTokens <= COMPACT_THRESHOLD) return this.context
    
    // const compactedContext = await this.contextManager.CompactContext(this.context)
    // const compactedTokens = this.estimateTokens(compactedContext)
    // if (compactedTokens <= COMPACT_THRESHOLD) return compactedContext

    // return await this.contextManager.SummarizeContext(compactedContext)

    async ManageContext(toolRes: any): Promise<ContextMap[T]> {
        // which is not needed for tester, uiexpert, researcher.
        if(!this.contextManager) return this.context

        const updated = this.contextManager.appendTurn(this.context, toolRes)
        
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

    async emitSSEUpdate(event: SSEBody) {
        await axios.post(`${BACKEND_URL}/internal/tasks/${this.taskId}/events`, event)
    }

    async SaveSessionState() {
        await axios.post(`${BACKEND_URL}/internal/tasks/${this.taskId}/state`, {
            iteration: this.iteration,
            context_snapshot: this.context,
            session_snapshot: this.session
        })
    }
}