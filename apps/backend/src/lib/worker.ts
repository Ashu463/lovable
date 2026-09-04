import { Worker } from "bullmq";
import { serve } from "inngest/bun";
import { redis } from "./redis";
import { logger } from "./utils";
import { prisma } from "./prisma";
import { E2BSandbox } from "../../../../packages/agents/agent/utils/sandbox";
import { runCallAgent, inngest, functions, runSpanContext } from "../../../../packages/agents";
import { sdk, flushTraces } from "../telemetry/langfuse";
import {startActiveObservation, startObservation} from '@langfuse/tracing'

const inngestHandler = serve({ client: inngest, functions });
const INNGEST_SERVE_PORT = Number(process.env.INNGEST_SERVE_PORT ?? 3001);
Bun.serve({
  port: INNGEST_SERVE_PORT,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/inngest") {
      const response = await inngestHandler(request);
      // Every Inngest step is its own request that ends right here. Anything
      // still sitting in the span buffer may never get sent, so push it now.
      await flushTraces();
      return response;
    }
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
      // Pinned to the run's own trace (derived from runId) instead of letting
      // Langfuse invent one. Without this, prep lands in one trace and
      // everything Inngest does later lands in a completely separate one.
      // BullMQ re-processes a stalled job (maxStalledCount) with the same
      // payload — mark that like the Inngest retries, so a re-run isn't a
      // mystery in the trace.
      if (job.attemptsMade > 0) {
        startObservation("bullmq-retry", { input: { attempt: job.attemptsMade } }, { asType: "event", parentSpanContext: await runSpanContext(runId) }).end()
      }
      await startActiveObservation(
        "prep",
        async (span) => {
          span.update({ input: prompt, metadata: { bullAttempt: job.attemptsMade } })
          const output = await runCallAgent(userId, projectId, prompt, runId, sandbox, semanticMem, answers, selectedDesignId);
          span.update({ output })
        },
        { parentSpanContext: await runSpanContext(runId) },
      )
    } catch(e){
      logger.error(`Failed to call agent ${runId}: ${e}`)
      throw e;
    }
    },{connection: redis, lockDuration: 300_000, stalledInterval: 30_000, maxStalledCount: 3, concurrency: 5}
);

worker.on("failed", (job, err) => {
  logger.error(`Job ${job?.id} failed: ${err.message}`);
});