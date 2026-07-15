import type { TaskSummary } from "../baml_client"
import type { Answers, OrchestratorResponse } from "../types/agentTypes"
import { OrchestratorAgent } from "./agent"
import { createBackendEmitter, type EventEmitter } from "./events";
import { E2BSandbox } from "./utils/sandbox"

// export async function SpinUpSandbox(userId: string, projectId: string): Promise<string>{

//     const sandbox: E2BSandbox = new E2BSandbox();
//     const sandboxId = await sandbox.StartSandbox(userId, projectId)
    
//     return sandboxId
// }
export async function AgentCall(
  userId: string,
  projectId: string,
  userPrompt: string,
  runId: string,
  sandbox: E2BSandbox,
  answers?: Answers[]
): Promise<void> {

  const orchestrator: OrchestratorAgent = new OrchestratorAgent(userId, projectId, sandbox, runId)

  try {
    await orchestrator.Orchestrate(userPrompt, answers)  // emits events internally as each agent finishes, doesn't return a final payload to await on
  } catch (err) {
    await createBackendEmitter(runId).emit({ type: "run_failed", error: String(err) })
  } finally {
    sandbox.Release()   // sandbox torn down only after the run actually finishes/fails
  }
}

