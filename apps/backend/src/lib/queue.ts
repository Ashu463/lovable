import { Queue } from "bullmq";
import { redis } from "./redis";

// Deliberately separate from worker.ts: producers (the API process, Bull Board)
// only need a handle to enqueue and inspect jobs. worker.ts pulls in the whole
// @repo/agents graph to actually run them, which the API process must not load.
export const runQueue = new Queue("run-agent", { connection: redis });
