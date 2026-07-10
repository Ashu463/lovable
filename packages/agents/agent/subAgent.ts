import { b, type Message, type Todo } from "../baml_client";
import { CoderAgent } from "./subagents/coder";
import { DebuggerAgent } from "./subagents/debugger";
import { Researcher } from "./subagents/researcher";
import { TesterAgent } from "./subagents/tester";

import type { BaseAgent } from "./subagents/baseAgent";
import { BACKEND_URL, COMPACT_THRESHOLD, MAX_SUBAGENT_ITERATIONS } from "./config/systemConfig";
import { encoding_for_model } from "tiktoken";
import { ContextManager } from "./utils/context";
import { SUBAGENT_SUMMARY_PROPMT, SUBAGENT_SYSTEM_PROMPT } from "./config/sysPrompts";
import type { SSEBody, SubAgentTaskInput } from "../types/mainAgentTypes";
import axios from "axios";

type AgentType = "researcher" | "coder" | "debugger" | "tester"

export class SubAgent<T extends SubAgentTaskInput> {
  private agentInstance: BaseAgent<any, any, any>
  private context: Message[] = []
  private session: Message[] = []
  private iteration: number = 0
  private contextManager: ContextManager
  private taskId: number

  constructor(
    public input: T,
    public userId: string,
    public projectId: string,
    public sandboxId: string,
    public semanticMem: string,
  ) {
    this.agentInstance = this.createAgent(input.agentType)
    this.contextManager = new ContextManager(SUBAGENT_SYSTEM_PROMPT, this.input.task.task, this.semanticMem)
    this.taskId = input.task.id 
  }

  private createAgent(agentType: T['agentType']): BaseAgent<any, any, any> {
    switch (agentType) {
      case 'coder': return new CoderAgent(this.userId, this.projectId, this.sandboxId)
      case 'researcher': return new Researcher(this.userId, this.projectId, this.sandboxId)
      case 'debugger': return new DebuggerAgent(this.userId, this.projectId, this.sandboxId)
      case 'tester': return new TesterAgent(this.userId, this.projectId, this.sandboxId)
      default: throw new Error(`${agentType} doesn't exist`)
    }
  }

  async runLoop(): Promise<string> {
    this.context = await this.buildInitialContext(this.input)

    while (true) {
      const res = await this.agentInstance.callLLM(this.input, this.context)

      if (res.action === 'done' || res.stopReason === 'completed' || res.stopReason === 'aborted') {
        this.pushMessage('assistant', res)
        await this.saveSessionState()
        break
      }

      const toolRes = await this.agentInstance.executeFunction(res)

      this.pushMessage('assistant', res)
      this.pushMessage('toolCall', toolRes)

      this.context = await this.manageContext()   

      await this.emitSSEUpdate({
        type: 'tool_result',
        content: JSON.stringify(toolRes),
        iteration: this.iteration,
      })
      await this.saveSessionState()

      if (this.iteration++ > MAX_SUBAGENT_ITERATIONS) break
    }

    return this.buildSummary()
  }
  pushMessage(role: Message['role'], content: any) {
    const msg: Message = {
      role,
      content: JSON.stringify(content),
      timestamp: new Date().toISOString(),
    }
    this.session.push(msg)
    this.context.push(msg)
  }

  async buildSummary(): Promise<string> {
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

  async manageContext(): Promise<Message[]> {
    const totalTokens = this.estimateTokens(this.context)
    if (totalTokens <= COMPACT_THRESHOLD) return this.context

    const compactedContext = await this.contextManager.CompactContext(this.context)
    const compactedTokens = this.estimateTokens(compactedContext)
    if (compactedTokens <= COMPACT_THRESHOLD) return compactedContext

    return await this.contextManager.SummarizeContext(compactedContext)
  }

  estimateTokens(context: Message[]): number {
    const encoder = encoding_for_model("gpt-4o")
    return encoder.encode(context.map(m => m.content).join('')).length
  }

  async emitSSEUpdate(event: SSEBody) {
    await axios.post(`${BACKEND_URL}/internal/tasks/${this.taskId}/events`, event)
  }

  async saveSessionState() {
    await axios.post(`${BACKEND_URL}/internal/tasks/${this.taskId}/state`, {
      iteration: this.iteration,
      context_snapshot: this.context,
    })
  }
}