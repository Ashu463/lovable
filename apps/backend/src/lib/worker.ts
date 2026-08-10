import { Worker } from "bullmq";
import { redis } from "./redis";
import { logger } from "./utils";
import { prisma } from "./prisma";
import { E2BSandbox } from "../../../../packages/agents/agent/utils/sandbox";
import { AgentCall } from "../../../../packages/agents";

const worker = new Worker("run-agent", async (job) => {
    const {userId, projectId, prompt, runId, semanticMem, sandboxId, answers, selectedDesignId, priorRunSummary } = job.data;
    let sandbox;
    if(sandboxId){
        sandbox = await E2BSandbox.StartSandbox(userId, projectId, sandboxId);
    } else {
        sandbox = await E2BSandbox.StartSandbox(userId, projectId);
    }

    if(sandbox.sandboxId !== sandboxId){
        await prisma.run.update({where: {id: runId}, data: {sandboxId: sandbox.sandboxId}}).catch((e) => {
            logger.error(`Failed to persist sandboxId for run ${runId}: ${e}`)
        })
    }

    try{
      logger.info(`Calling agent ${runId} with sandbox ${sandbox.sandboxId}`);
      await AgentCall(userId, projectId, prompt, runId, sandbox, semanticMem, answers, selectedDesignId, priorRunSummary);
    } catch(e){
      logger.error(`Failed to call agent ${runId}: ${e}`)
      throw e;
    }
    // lockDuration has to outlast the longest gap between job progress, and a
    // cold sandbox (R2 restore + npm install) alone has taken ~60s, so the old
    // 60s lock could stall a job that was working fine. maxStalledCount 1 also
    // meant a single worker restart killed whatever run was in flight.
    },{connection: redis, lockDuration: 300_000, stalledInterval: 30_000, maxStalledCount: 3, concurrency: 5}
);

worker.on("failed", (job, err) => {
  logger.error(`Job ${job?.id} failed: ${err.message}`);
});