import { b, type Message, type Todo } from "../baml_client";
import { CoderAgent } from "./subagents/coder";
import { DebuggerAgent } from "./subagents/debugger";
import { Researcher } from "./subagents/researcher";
import { TesterAgent } from "./subagents/tester";

import type { BaseAgent } from "./subagents/baseAgent";
import { BACKEND_URL, CODER_MAX_ITERATIONS, COMPACT_THRESHOLD, DEBUGGER_MAX_ITERATIONS, MAX_SUBAGENT_ITERATIONS } from "./config/systemConfig";
import { encoding_for_model } from "tiktoken";
import { ContextManager } from "./utils/context";
import { SUBAGENT_SUMMARY_PROPMT, SUBAGENT_SYSTEM_PROMPT } from "./config/sysPrompts";
import type { SSEBody } from "../types/mainAgentTypes";
import axios from "axios";
import type { ResearcherContext, SubAgentsContext, SubAgentsSession, SubAgentTaskInput, TesterContext } from "../types/subAgentsTypes";
import { UIExpert } from "./subagents/uiExpert";

type AgentType = "researcher" | "coder" | "debugger" | "tester" | "uiExpert"
export class SubAgent<T extends AgentType> {
    private agentInstance: BaseAgent<SubAgentTaskInput[T], SubAgentsContext[T], any, any>
    private context!:  SubAgentsContext[T] // FIX: please fix this '!' where I'm assuming this context array would never ever be null
    private session!: SubAgentsSession[T]
    private iteration: number = 0
    private contextManager: ContextManager
    private taskId: number

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
    }

    private createAgent(agentType: T): BaseAgent<any, any, any, any> {
        switch (agentType) {
        case 'coder': return new CoderAgent(this.userId, this.projectId, this.sandboxId) as any
        case 'researcher': return new Researcher(this.userId, this.projectId, this.sandboxId) as any
        case 'debugger': return new DebuggerAgent(this.userId, this.projectId, this.sandboxId) as any
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
            case 'coder': return this.BuildCoderContext() as SubAgentsContext[T]
            case 'debugger': return this.BuildDebuggerContext() as SubAgentsContext[T]
            case 'researcher': return this.BuildResearcherContext() as SubAgentsContext[T]
            case 'tester': return {} as SubAgentsContext[T]
            case 'uiExpert': return this.BuildUIExpertContext() as SubAgentsContext[T]
            default:    
                throw new Error(`No such context builder for ${this.agentType}`)
        }
        
    }
    BuildCoderContext(): SubAgentsContext[T]{
        let summaries: string = ""
        for(const task of this.input.task.dependency){
            summaries += this.context.filter((context) => context.taskId === task).map((c) => c.summary)
        }
        this.sand
        return summaries
    }
    BuildDebuggerContext(): SubAgentsContext[T]{

    }
    BuildResearcherContext(): SubAgentsContext[T]{

    }
    BuildUIExpertContext(): SubAgentsContext[T]{

    }
    private maxIterations(): number {
        switch (this.agentType) {
            case 'debugger': return DEBUGGER_MAX_ITERATIONS
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

    async ManageContext(): Promise<SubAgentsContext[T]> {
        switch(this.agentType){
            case 'coder': return this.UpdateCoderContext() as SubAgentsContext[T]
            case 'debugger': return this.UpdateCoderContext() as SubAgentsContext[T]
            default: return this.context
        }
        // const totalTokens = this.estimateTokens(this.context)
        // if (totalTokens <= COMPACT_THRESHOLD) return this.context

        // const compactedContext = await this.contextManager.CompactContext(this.context)
        // const compactedTokens = this.estimateTokens(compactedContext)
        // if (compactedTokens <= COMPACT_THRESHOLD) return compactedContext

        // return await this.contextManager.SummarizeContext(compactedContext)
    }
    UpdateCoderContext(): SubAgentsContext[T]{
        
    }
    UpdateDebuggerContext(): SubAgentsContext[T]{

    }
    estimateTokens(context: SubAgentsContext[]): number {
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