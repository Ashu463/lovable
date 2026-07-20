import { Queue, Worker } from "bullmq";
import { redis } from "./redis";
import { logger } from "./utils";
import { E2BSandbox } from "../../../../packages/agents/agent/utils/sandbox";
import { AgentCall } from "../../../../packages/agents";

export const runQueue = new Queue(
    "run-agent", {connection: redis}
);
const worker = new Worker("run-agent", async (job) => {
    const {userId, projectId, prompt, runId, semanticMem, sandboxId, answers } = job.data;
    // Reconnect to the sandbox chat.ts already started for this run instead of
    // booting a second one.
    let sandbox;
    if(sandboxId){
        sandbox = await E2BSandbox.StartSandbox(userId, projectId, sandboxId);
    } else {
        sandbox = await E2BSandbox.StartSandbox(userId, projectId);
    }
    try{
      logger.info(`Calling agent ${runId} with sandbox ${sandbox.sandboxId}`);
      await AgentCall(userId, projectId, prompt, runId, sandbox, semanticMem, answers);
    } catch(e){
      logger.error(`Failed to call agent ${runId}: ${e}`)
      throw e;
    }
    },{connection: redis, concurrency: 5}
);

worker.on("failed", (job, err) => {
  logger.error(`Job ${job?.id} failed: ${err.message}`);
});