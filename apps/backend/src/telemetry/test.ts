// apps/backend/src/telemetry/smoke-test.ts
import "./langfuse";
import { startActiveObservation } from "@langfuse/tracing";
import { sdk } from "./langfuse";

await startActiveObservation("smoke-test", async (span) => {
    span.update({ input: "hello", output: "world" });
  });
  console.log("observation block finished"); // did this print?
  await sdk.shutdown();
  console.log("shutdown complete"); // did THIS print?