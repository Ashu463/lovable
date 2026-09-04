import { b } from "../../baml_client"
import type { PlannerTodo, PlannedScreen } from "../../baml_client"
import { ENUMERATE_SCREENS_PROMPT, PLAN_TASKS_PROMPT } from "../config/systemPrompts"
import { backendGql } from "./backendClient"
import { startActiveObservation, startObservation } from "@langfuse/tracing"
import { observeBaml, runSpanContext } from "./tracing"
import { generateScreenHtml } from "../tools/stitch"
import { designRefPath } from "./designPath"
import { E2BSandbox } from "./sandbox"
import { PROJECT_ROOT, STITCH_DESIGN_CONCURRENCY, STITCH_DESIGN_RETRY_ATTEMPTS, STITCH_DESIGN_BACKOFF_MS } from "../config/systemConfig"
import { logger } from "./logger"

// Two-phase planner, extracted from Orchestrator so planning is an independent,
// unit-testable piece. Phase 1 holds only the reasoning methods — both are pure
// BAML calls, no sandbox. The design-generation half (Stitch + E2B) arrives in
// Phase 2, which is when this constructor gains a sandbox.
//
// Both methods anchor their spans to the run trace via runSpanContext(runId) so
// they merge with prep and the DAG into one Langfuse trace. Call them from
// inside a step.run (Execute wraps them) — they never nest step.run themselves.
// Outcome of generating one screen's design. `degraded` means Stitch failed
// all retries — the run continues and that screen is built design-less.
export type DesignResult = { screenId: string, status: 'generated' | 'reused' | 'degraded', reason?: string }

export class Planner {
    constructor(
        private userId: string,
        private projectId: string,
        private runId: string,
    ) {}

    // Call 1: what screens does this request need. Cheap/fast so the design
    // phase (Phase 2) can start while planTasks runs concurrently.
    async enumerateScreens(request: string, context: string): Promise<PlannedScreen[]> {
        return startActiveObservation(
            "enumerate-screens",
            async (span): Promise<PlannedScreen[]> => {
                span.update({ input: { request } })
                const screens = await observeBaml(
                    "EnumerateScreens",
                    { request },
                    (opts) => b.EnumerateScreens(ENUMERATE_SCREENS_PROMPT, request, context, opts),
                )
                span.update({ output: screens })
                return screens
            },
            { parentSpanContext: await runSpanContext(this.runId) },
        )
    }

    // Call 2: the task DAG, anchored to the enumerated screens so a uiExpert
    // item's designRef only ever points at a screen that exists in the plan.
    async planTasks(request: string, context: string, screens: PlannedScreen[]): Promise<PlannerTodo[]> {
        return startActiveObservation(
            "plan-tasks",
            async (span): Promise<PlannerTodo[]> => {
                span.update({ input: { request, screens: screens.length } })
                // reasoning is CoT scratch space for the decomposition — kept
                // on the trace for debugging, never persisted to the DB.
                const { reasoning, todos } = await observeBaml(
                    "PlanTasks",
                    { request, screens: screens.length },
                    (opts) => b.PlanTasks(PLAN_TASKS_PROMPT, request, context, screens, opts),
                )
                span.update({ output: todos, metadata: { reasoning } })
                await this.saveTodos(todos)
                return todos
            },
            { parentSpanContext: await runSpanContext(this.runId) },
        )
    }

    // Persisted for the frontend's plan view; the executor reads todos from
    // memory (Inngest-memoized step return), not from here. Non-throwing so a
    // failed display-write never sinks the run.
    //
    // PlannedTodoInput only declares id/task/agent/status/dependency — mapped
    // explicitly rather than passing PlannerTodo through as-is, since its
    // extra fields (description/designRef/expectedToolCalls) are unknown
    // input keys that make graphql-js reject the whole mutation.
    private async saveTodos(todos: PlannerTodo[]): Promise<void> {
        const input = todos.map(({ id, task, agent, status, dependency }) => ({ id, task, agent, status, dependency }))
        await backendGql(
            `mutation SaveTodos($projectId: ID!, $runId: ID!, $todos: [PlannedTodoInput!]!) {
                saveTodos(projectId: $projectId, runId: $runId, todos: $todos) { id taskId }
            }`,
            { projectId: this.projectId, runId: this.runId, todos: input },
        ).catch(e => logger.error(`Failed to save todos for run ${this.runId}: ${e}`))
    }

    // Design pre-phase (Phase 2). Generates every screen's Stitch design up
    // front, keyed by the planner's stable screen id, so the DAG later just
    // reads them. Bounded concurrency (pool) instead of a raw fan-out so we
    // overlap the slow generations without stampeding the Stitch key.
    //
    // Failure is a VALUE, not an exception: after exhausting retries a screen
    // is marked `degraded` and the others keep going — one flaky external call
    // never sinks the whole build, and (once this is a step.run) no throw means
    // no Inngest retry storm. sandbox is a method arg, not constructor state,
    // so the planning methods above stay sandbox-free and unit-testable.
    async generateDesigns(screens: PlannedScreen[], sandbox: E2BSandbox): Promise<DesignResult[]> {
        return startActiveObservation(
            "generate-designs",
            async (span): Promise<DesignResult[]> => {
                span.update({ input: { screens: screens.length } })
                const results: DesignResult[] = []

                for (let i = 0; i < screens.length; i += STITCH_DESIGN_CONCURRENCY) {
                    const chunk = screens.slice(i, i + STITCH_DESIGN_CONCURRENCY)
                    const chunkResults = await Promise.all(chunk.map((screen) =>
                        startActiveObservation(`design-${screen.id}`, async (s): Promise<DesignResult> => {
                            s.update({ input: { screenId: screen.id, name: screen.name } })
                            const path = designRefPath(screen.id)

                            // Cross-run reuse: the sandbox persists, so a design
                            // from a prior run is already here — don't re-Stitch it.
                            const existing = await sandbox.Execute(sandbox.sandboxId, { action: 'read', path }, PROJECT_ROOT).catch(() => null)
                            if (existing?.success && existing.content.length > 0) {
                                s.update({ output: { status: 'reused' } })
                                return { screenId: screen.id, status: 'reused' }
                            }

                            for (let attempt = 1; attempt <= STITCH_DESIGN_RETRY_ATTEMPTS; attempt++) {
                                try {
                                    const html = await generateScreenHtml(screen.designBrief, this.userId)
                                    const writeRes = await sandbox.Execute(sandbox.sandboxId, { action: 'writeFile', path, content: html }, PROJECT_ROOT)
                                    if (!writeRes.success) throw new Error(`design write failed: ${writeRes.content}`)
                                    s.update({ output: { status: 'generated' } })
                                    return { screenId: screen.id, status: 'generated' }
                                } catch (e) {
                                    logger.warn(`Stitch design for screen ${screen.id} failed (attempt ${attempt}/${STITCH_DESIGN_RETRY_ATTEMPTS}): ${e instanceof Error ? e.message : String(e)}`)
                                    if (attempt < STITCH_DESIGN_RETRY_ATTEMPTS) {
                                        await new Promise((r) => setTimeout(r, STITCH_DESIGN_BACKOFF_MS * attempt))
                                    }
                                }
                            }

                            const reason = `Stitch failed to design screen ${screen.id} after ${STITCH_DESIGN_RETRY_ATTEMPTS} attempts`
                            logger.error(reason)
                            startObservation("design-degraded", { input: { screenId: screen.id } }, { asType: "event" }).end()
                            s.update({ level: "ERROR", statusMessage: reason })
                            return { screenId: screen.id, status: 'degraded', reason }
                        })))
                    results.push(...chunkResults)
                }

                // Push the freshly-written designs to R2. Without this, an E2B
                // recycle+restore between here and the uiExpert would lose them
                // (they're written to the live sandbox only). newly-generated
                // designs are the only ones at risk — reused ones are already
                // persisted, and a full skip needs no sync.
                if (results.some((r) => r.status === 'generated')) {
                    await sandbox.SyncR2().catch((e) => logger.error(`Failed to sync designs to R2: ${e}`))
                    startObservation("designs-synced", { input: { count: results.filter((r) => r.status === 'generated').length } }, { asType: "event" }).end()
                }

                span.update({ output: {
                    generated: results.filter((r) => r.status === 'generated').length,
                    reused: results.filter((r) => r.status === 'reused').length,
                    degraded: results.filter((r) => r.status === 'degraded').length,
                } })
                return results
            },
            { parentSpanContext: await runSpanContext(this.runId) },
        )
    }
}
