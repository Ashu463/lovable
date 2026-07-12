import { b, type CoderContext, type DebuggerContext, type SubAgentsContext, type Message, type TaskSummary, type Todo, type UIExpertContext } from "../baml_client";
import { CoderAgent } from "./subagents/coder";
import { DebuggerAgent } from "./subagents/debugger";
import { Researcher } from "./subagents/researcher";
import { TesterAgent } from "./subagents/tester";

import type { BaseAgent } from "./subagents/baseAgent";
import { BACKEND_URL, CODER_MAX_ITERATIONS, COMPACT_THRESHOLD, DEBUGGERR_MAX_ITERATIONS, MAX_SUBAGENT_ITERATIONS } from "./config/systemConfig";
import { encoding_for_model } from "tiktoken";
import { ContextManager } from "./utils/context";
import { SUBAGENT_SUMMARY_PROPMT, SUBAGENT_SYSTEM_PROMPT } from "./config/sysPrompts";
import type { SSEBody } from "../types/mainAgentTypes";
import axios from "axios";
import type { ResearcherContext, SubAgentsSession, SubAgentTaskInput } from "../types/subAgentsTypes";
import { UIExpert } from "./subagents/uiExpert";
import { E2BSandbox } from "./utils/sandbox";

type AgentType = keyof SubAgentsContext
export class SubAgent<T extends AgentType> {
    private agentInstance: BaseAgent<SubAgentTaskInput[T], SubAgentsContext[T], any, any>
    private context!:  SubAgentsContext[T] // FIX: please fix this '!' where I'm assuming this context array would never ever be null
    private session!: SubAgentsSession[T]
    private iteration: number = 0
    private contextManager: ContextManager
    private taskId: number
    private sandbox: E2BSandbox
    private repoTree: string = ""
    constructor(
        public agentType: T,
        public input: SubAgentTaskInput[T],
        public userId: string,
        public projectId: string,
        public sandboxId: string,
        public semanticMem: string,
    ) {
        this.agentInstance = this.createAgent(agentType)
        this.contextManager = new ContextManager(SUBAGENT_SYSTEM_PROMPT, this.input.task.task, this.semanticMem)
        this.taskId = input.task.id 
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

    async runLoop(): Promise<string> {
        this.context = await this.BuildInitialContext()

        while (true) {
            const res = await this.agentInstance.callLLM(this.input, this.context)

            if (res.action === 'done' || res.stopReason === 'completed' || res.stopReason === 'aborted') {
                this.pushMessage('assistant', res)
                await this.SaveSessionState()
                break
            }

            const toolRes = await this.agentInstance.executeFunction(res)

            this.pushMessage('assistant', res)
            this.pushMessage('toolCall', toolRes)

            this.context = await this.ManageContext()   

            await this.emitSSEUpdate({
                type: 'tool_result',
                content: JSON.stringify(toolRes),
                iteration: this.iteration,
            })
            await this.SaveSessionState()

            if (this.iteration++ > MAX_SUBAGENT_ITERATIONS) break
        }

        return this.BuildSummary()
    }
    async BuildInitialContext(): Promise<SubAgentsContext[T]>{
        switch(this.agentType){
            case 'coder': return await this.BuildCoderContext() as SubAgentsContext[T]
            case 'debuggerr': return await this.BuildDebuggerContext() as SubAgentsContext[T]
            case 'researcher': return await this.BuildResearcherContext() as SubAgentsContext[T]
            case 'tester': return {} as SubAgentsContext[T]
            case 'uiExpert': return await this.UIExpertContext() as SubAgentsContext[T]
            default:    
                throw new Error(`No such context builder for ${this.agentType}`)
        }
        
    }
    async BuildCoderContext(): Promise<CoderContext>{
        const dependentTaskIds = this.input.task.dependency
        if(this.repoTree === ""){
            const cwd = await this.sandbox.Execute(this.sandboxId, {action: 'runCommand', command: "find / -name package.json -not -path '*/node_modules/*' | head -1"})
            let root = cwd.stdout?.trim().replace("/\/package\.json$/", "")
            this.repoTree = (await this.sandbox.Execute(this.sandboxId, {action: 'runCommand', command: `cd ${cwd} && tree -I 'node_modules|.git|dist|build'`})).content
        }
        const res = await axios.get(`${BACKEND_URL}/db/fetchSummaries`, {
            data: {dependentTaskIds}
        }) 
        const summaries: TaskSummary[] = res.data
        return { dependentSummary: summaries, repoTree: this.repoTree }
    }
    async BuildDebuggerContext(): Promise<DebuggerContext>{
        return {
            originalError: this.input.task.task,
            fixHistory: []
        }
    }
    async BuildResearcherContext(): Promise<ResearcherContext>{
        return { query: this.input.task.task }
    }
    async UIExpertContext(): Promise<UIExpertContext>{
        const priorDesigns = await axios.get(`${BACKEND_URL}/db/fetchPriorDesigns`, {
            params: { projectId: this.projectId }
        })
        return {
            userPrompt: this.input.task.task,
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
    pushMessage(role: Message['role'], content: any) {
        const msg: SubAgentsContext = {
            role,
            content: JSON.stringify(content),
            timestamp: new Date().toISOString(),
        }
        this.session.push(msg)
        this.context.push(msg)
    }

    async BuildSummary(): Promise<string> {
        try {
            return await b.GenerateSummary(SUBAGENT_SUMMARY_PROPMT, this.context)
        } catch (e) {
            console.error("Error occurred while generating summary")
            throw e
        }
    }

    async buildInitialContext(input: T): Promise<Message[]> {
        return [{
            role: 'user',
            content: JSON.stringify(input),   // task + agent-specific fields (boilerplate/errors/query etc)
            //   id: generateId(),
            timestamp: new Date().toISOString(),
        }]
    }

    async ManageContext(toolRes?: any): Promise<SubAgentsContext[T]> {
        switch(this.agentType){
            case 'coder': return this.UpdateCoderContext() as SubAgentsContext[T]
            case 'debuggerr': return this.UpdateDebuggerContext(toolRes) as SubAgentsContext[T]
            default: return this.context
        }
        // const totalTokens = this.estimateTokens(this.context)
        // if (totalTokens <= COMPACT_THRESHOLD) return this.context
        
        // const compactedContext = await this.contextManager.CompactContext(this.context)
        // const compactedTokens = this.estimateTokens(compactedContext)
        // if (compactedTokens <= COMPACT_THRESHOLD) return compactedContext

        // return await this.contextManager.SummarizeContext(compactedContext)
    }
    async UpdateCoderContext(): Promise<CoderContext>{
        const current = this.context as CoderContext
        const totalTokens = this.estimateTokensCoder(current)
        if (totalTokens <= COMPACT_THRESHOLD) return current

        const compactedContext = await this.contextManager.CompactContext(this.context)
        const compactedTokens = this.estimateTokensCoder(compactedContext)
        if (compactedTokens <= COMPACT_THRESHOLD) return compactedContext

        return await this.contextManager.SummarizeContext(this.context)
    }
    UpdateDebuggerContext(toolRes: any): DebuggerContext {
        const current = this.context as DebuggerContext
        return {
            originalError: current.originalError,
            fixHistory: [
                ...current.fixHistory,
                { error: current.originalError, fixSummary: toolRes.summary ?? JSON.stringify(toolRes) }
            ]
        }
    }
    estimateTokensCoder(context: CoderContext): number {
        const encoder = encoding_for_model("gpt-4o")

        return encoder.encode(context.map(item => JSON.stringify(item)).join('\n')).length
    }

    async emitSSEUpdate(event: SSEBody) {
        await axios.post(`${BACKEND_URL}/internal/tasks/${this.taskId}/events`, event)
    }

    async SaveSessionState() {
        await axios.post(`${BACKEND_URL}/internal/tasks/${this.taskId}/state`, {
            iteration: this.iteration,
            context_snapshot: this.context,
        })
    }
}