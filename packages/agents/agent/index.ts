import type { TaskSummary } from "../baml_client"
import type { OrchestratorResponse } from "../types/agentTypes"
import type { Answers } from "../types/types"
import { OrchestratorAgent } from "./agent"
import { E2BSandbox } from "./utils/sandbox"
// #CRITCIAL - All written by AI - Check it once on your side
// inside sandbox: AgentCall
export async function AgentCall(
  userId: string,
  projectId: string,
  userPrompt: string,
  emitter: EventEmitter,   // <- backendClient-backed emitter, POSTs to /internal/sessions/:projectId/events
  answers?: Answers[]
): Promise<void> {
  const sandbox: E2BSandbox = new E2BSandbox()
  const sandboxId = await sandbox.StartSandbox(userId, projectId)

  const orchestrator: OrchestratorAgent = new OrchestratorAgent(userId, projectId, sandboxId, emitter)

  try {
    await orchestrator.Orchestrate(userPrompt, answers)  // emits events internally as each agent finishes, doesn't return a final payload to await on
  } catch (err) {
    await emitter.emit({ type: "run_failed", error: String(err) })
  } finally {
    await sandbox.Release()   // sandbox torn down only after the run actually finishes/fails
  }
}
// shared package: events.ts
export type OrchestratorEvent =
  | { type: "agent_started"; agent: string; taskId: string }
  | { type: "agent_progress"; agent: string; taskId: string; data: unknown }
  | { type: "agent_completed"; agent: string; taskId: string; summary: TaskSummary }
  | { type: "clarification_needed"; question: string }
  | { type: "run_completed"; result: OrchestratorResponse }
  | { type: "run_failed"; error: string };

export interface EventEmitter {
  emit(event: OrchestratorEvent): Promise<void>;
}