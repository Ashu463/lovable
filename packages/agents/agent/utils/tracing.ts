import { Collector } from "@boundaryml/baml"
import { createTraceId, startObservation, type LangfuseSpan } from "@langfuse/tracing"

// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS
//
// Langfuse groups spans by "trace ID". Normally you never think about it: one
// process handles one request, the SDK makes a trace ID once, and every span
// created underneath inherits it automatically.
//
// Our run doesn't work like that. A single run is executed by three different
// kinds of process, none of which share memory:
//
//   1. the BullMQ worker job         -> CallAgent.Execute (prep)
//   2. one Inngest HTTP invocation   -> step "plan"
//   3. another Inngest HTTP call     -> step "level-0-spawn"    ... and so on
//
// Each of those would invent its own trace ID, and one run would show up in
// Langfuse as a dozen unrelated traces.
//
// The fix: don't let the SDK invent the ID. Derive it from something all three
// already know — the runId. createTraceId(seed) is a hash: same seed in, same
// ID out, every time, in any process. So all three independently compute the
// same trace ID and their spans land in the same trace.
// ---------------------------------------------------------------------------

/**
 * Turns a runId into the "parent" that every span for that run should hang off.
 *
 * You pass the result as `parentSpanContext`, which is Langfuse's way of saying
 * "this span belongs to that trace, under that parent" — without needing the
 * real parent object, which lives in a different process.
 */
export async function runSpanContext(runId: string) {
    const traceId = await createTraceId(runId)

    const spanId = (await createTraceId(`${runId}:root`)).slice(0, 16)

    return { traceId, spanId, traceFlags: 1 }
}

export async function startRunSpan(
    runId: string,
    name: string,
    attributes: { input?: unknown, metadata?: Record<string, unknown> } = {},
): Promise<LangfuseSpan> {
    return startObservation(name, attributes, { parentSpanContext: await runSpanContext(runId) })
}

function bamlGenerationAttributes(collector: Collector) {
    // `last` is the most recent BAML function call this collector saw.
    const log = collector.last
    if (!log) return {}

    // BAML retries and falls back between clients on its own. `calls` has one
    // entry per attempt; the final one is what actually produced the output.
    // (Note: JS has no negative indexing — .at(-1), not [-1].)
    const call = log.calls.at(-1)
    const usage = log.usage

    return {
        model: call?.clientName,
        usageDetails: {
            input: usage.inputTokens ?? 0,
            output: usage.outputTokens ?? 0,
            cache_read_input_tokens: usage.cachedInputTokens ?? 0,
        },
        metadata: {
            provider: call?.provider,
            bamlFunction: log.functionName,
            // >1 means BAML retried internally — useful when a step looks slow.
            bamlAttempts: log.calls.length,
            durationMs: log.timing.durationMs,
        },
    }
}


export async function observeBaml<T>(
    name: string,
    input: unknown,
    call: (opts: { collector: Collector }) => Promise<T>,
    parent?: LangfuseSpan,
): Promise<T> {
    const collector = new Collector(name)
    const generation = parent
        ? parent.startObservation(name, { input }, { asType: "generation" })
        : startObservation(name, { input }, { asType: "generation" })

    try {
        const output = await call({ collector })
        generation.update({ output, ...bamlGenerationAttributes(collector) })
        return output
    } catch (e) {
        generation.update({
            level: "ERROR",
            statusMessage: e instanceof Error ? e.message : String(e),
            ...bamlGenerationAttributes(collector),
        })
        throw e
    } finally {
        generation.end()
    }
}
