import type { TaskSummary } from "../baml_client"
import type { Answers, OrchestratorResponse } from "../types/agentTypes"
import { OrchestratorAgent } from "./agent"
import { createRunEmitter, type EventEmitter } from "./events";
import { E2BSandbox } from "./utils/sandbox"
import { logger } from "./utils/logger"

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
  semanticMem: string,
  answers?: Answers[],
  selectedDesignId?: string
): Promise<OrchestratorResponse> {

  const orchestrator: OrchestratorAgent = new OrchestratorAgent(userId, projectId, sandbox, runId, semanticMem)

  try {
    const result = await orchestrator.Orchestrate(userPrompt, answers, selectedDesignId)
    return result
  } catch (err) {
    // The event is only for the UI — the job itself must still fail so BullMQ
    // marks it failed instead of completed with an undefined result.
    logger.error(`AgentCall failed for run ${runId}: ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
    await createRunEmitter(runId).emit({ type: "run_failed", error: err instanceof Error ? err.message : String(err) })
    throw err
  }
}

