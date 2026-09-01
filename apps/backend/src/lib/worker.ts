import { Worker } from "bullmq";
import { serve } from "inngest/bun";
import { redis } from "./redis";
import { logger } from "./utils";
import { prisma } from "./prisma";
import { E2BSandbox } from "../../../../packages/agents/agent/utils/sandbox";
import { runCallAgent, inngest, functions } from "../../../../packages/agents";
import { sdk } from "../telemetry/langfuse";
import {startActiveObservation, startObservation} from '@langfuse/tracing'

const inngestHandler = serve({ client: inngest, functions });
const INNGEST_SERVE_PORT = Number(process.env.INNGEST_SERVE_PORT ?? 3001);
Bun.serve({
  port: INNGEST_SERVE_PORT,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/inngest") return inngestHandler(request);
    return new Response("Not found", { status: 404 });
  },
});
logger.info(`Inngest functions served on http://localhost:${INNGEST_SERVE_PORT}/api/inngest`);

const worker = new Worker("run-agent", async (job) => {
    const {userId, projectId, prompt, runId, semanticMem, sandboxId, answers, selectedDesignId } = job.data;
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
      await startActiveObservation(`agent-run-for-${runId}`, async (span) => {
        span.update({input: prompt})
        const output = await runCallAgent(userId, projectId, prompt, runId, sandbox, semanticMem, answers, selectedDesignId);
        span.update({output: output})
      })
    } catch(e){
      logger.error(`Failed to call agent ${runId}: ${e}`)
      throw e;
    }
    },{connection: redis, lockDuration: 300_000, stalledInterval: 30_000, maxStalledCount: 3, concurrency: 5}
);

worker.on("failed", (job, err) => {
  logger.error(`Job ${job?.id} failed: ${err.message}`);
});