
import { AgentCall } from "../../../packages/agents";
import { E2BSandbox } from "../../../packages/agents/agent/utils/sandbox";
import { Queue, Worker } from "bullmq";
import { redis } from "./redis";
import { logger } from "./utils";

export const runQueue = new Queue(
    "run-agent", {connection: redis}
);
const worker = new Worker("run-agent", async (job) => {
    const {userId, projectId, prompt, runId, semanticMem, sandboxId, answers } = job.data;
    // Reconnect to the sandbox chat.ts already started for this run instead of
    // booting a second one.
    const sandbox = await E2BSandbox.StartSandbox(userId, projectId, sandboxId);
    await AgentCall(userId, projectId, prompt, runId, sandbox, semanticMem, answers);
    },{connection: redis, concurrency: 5}
);

worker.on("failed", (job, err) => {
  logger.error(`Job ${job?.id} failed: ${err.message}`);
});