import type { Answers } from "../types/callAgentTypes"
import { CallAgent } from "./callAgent"
import { createRunEmitter } from "./events";
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
  semanticMem: string,
  answers?: Answers[],
  selectedDesignId?: string,
  priorRunSummary?: string | null,
): Promise<any> {

  const orchestrator: CallAgent = new CallAgent(userId, projectId, sandbox, runId, semanticMem, priorRunSummary ?? null)

  try {
    const result = await orchestrator.Run(userPrompt, answers, selectedDesignId)
    return result
  } catch (err) {
    await createRunEmitter(runId).emit({ type: "run_failed", error: String(err) })
  }
}

