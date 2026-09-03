// apps/backend/src/telemetry/langfuse.ts
import "dotenv/config"
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";

// Held in a variable (instead of inline) only so we can force a flush on it
// below — the SDK doesn't expose the processor once it's been handed over.
const langfuseProcessor = new LangfuseSpanProcessor({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL,
});

export const sdk = new NodeSDK({ spanProcessors: [langfuseProcessor] });
sdk.start();

/**
 * Pushes any buffered spans to Langfuse right now.
 *
 * By default spans are batched and sent on a timer, which is fine for the
 * BullMQ worker because that process stays alive. It is NOT fine for the
 * Inngest endpoint: every step is a separate HTTP request that finishes and
 * goes idle, so a batch sitting in the buffer can be left stranded there.
 * Call this before returning the Inngest response.
 */
export const flushTraces = () => langfuseProcessor.forceFlush();

// Registering a signal handler REPLACES the default "terminate" behaviour, so
// without the explicit exit() the process flushes its spans and then hangs
// forever — holding :3001 and making the next start fail to bind.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    await sdk.shutdown().catch(() => {});
    process.exit(0);
  });
}