import { b } from "../baml_client"
import type { PlannedScreen } from "../baml_client"
import type { UIPreferenceQA } from "../types/callAgentTypes"
import type { Error as AgentError, PlannerTodo, ToolResult } from "../baml_client/types"
import type { TesterContext } from "../baml_client"
import { DAG } from "./services/dag"
import { E2BSandbox } from "./utils/sandbox"
import { WorktreeGit } from "./utils/gitWorktree"
import { SubAgent } from "./subAgent"
import { TesterAgent, type TesterResponse } from "./subagents/tester"
import type { InputMap, SubAgentType } from "../types/subAgentsTypes"
import type { CallAgentContext, CallAgentState } from "./callAgent"
import { CALL_AGENT_SUMMARY_PROMPT } from "./config/systemPrompts"
import { TESTER_DEBUGGER_LOOP_MAX_ITERATIONS, PROJECT_ROOT, SUBAGENT_TASK_RETRY_ATTEMPTS, SUBAGENT_RETRY_BACKOFF_MS } from "./config/systemConfig"
import { backendGql } from "./utils/backendClient"
import { createRunEmitter, type EventEmitter } from "./events"
import { logger } from "./utils/logger"
import { observeBaml } from "./utils/tracing"
import { Planner, type DesignResult } from "./utils/planner"
import { SkillStore } from "./skills"
import { startActiveObservation, startObservation } from "@langfuse/tracing"

type SerializableState = {
    lastTestErrors: AgentError[]
    lastToolResult: ToolResult | null
}

function toCallAgentState(s: SerializableState): CallAgentState {
    return {
        lastTestErrors: s.lastTestErrors,
        lastToolResult: s.lastToolResult,
        lastError: s.lastTestErrors[s.lastTestErrors.length - 1] ?? null,
    }
}

type RunDecision = { action: 'continue' } | { action: 'replan' } | { action: 'abort', reason: string }
export type StepRunner = { run: (id: string, fn: () => Promise<any>) => Promise<any> }

export class Orchestrator {
    private context: CallAgentContext[] = []
    private state: SerializableState = { lastTestErrors: [], lastToolResult: null }
    private todos: PlannerTodo[] = []
    private allSummaries: string[] = []
    private emitter: EventEmitter
    private skillStore: SkillStore = new SkillStore()
    private worktreeGit = new WorktreeGit()

    constructor(
        private userId: string,
        private projectId: string,
        private runId: string,
        private sandboxId: string,
        private semanticMem: string,
        private updatedPrompt: string,
        private priorContext: string,
        private uiPreferences: UIPreferenceQA[],
    ) {
        this.emitter = createRunEmitter(runId)
    }

    private async reconnectSandbox(): Promise<E2BSandbox> {
        return E2BSandbox.StartSandbox(this.userId, this.projectId, this.sandboxId)
    }

    private buildSubAgentInput<T extends SubAgentType>(agentType: T, todo: { id: number, task: string, dependency: number[], designRef?: string | null, description?: string, expectedToolCalls?: number }, state: CallAgentState): InputMap[T] {
        const base = { taskId: todo.id, task: todo.task, description: todo.description ?? "", expectedToolCalls: todo.expectedToolCalls ?? 0, dependentTasks: todo.dependency }
        switch (agentType) {
            case 'coder':
                return {
                    task: { ...base, agentType: 'coder', agentSpecificData: {} },
                    callAgentContext: this.context,
                    semanticMem: this.semanticMem,
                    agentType: 'coder',
                } as unknown as InputMap[T]
            case 'uiExpert':
                return {
                    task: { ...base, agentType: 'uiExpert', agentSpecificData: {} },
                    agentType: 'uiExpert',
                    updatedPrompt: this.updatedPrompt,
                    uiPreferences: this.uiPreferences,
                    designRef: todo.designRef ?? undefined,
                } as unknown as InputMap[T]
            case 'debuggerr':
                if (!state.lastToolResult) throw new Error(`debuggerr input requested without a last tool result`)
                return {
                    task: { ...base, agentType: 'debuggerr', agentSpecificData: {} },
                    agentType: 'debuggerr',
                    callAgentContext: this.context,
                    semanticMem: this.semanticMem,
                    errors: state.lastTestErrors,
                    toolResult: state.lastToolResult,
                } as unknown as InputMap[T]
            default:
                throw new Error(`no input builder for ${agentType}`)
        }
    }

    // TODO (context engine) — pure interface stub. The engine doesn't exist
    // as code yet; wire this up to it directly (subagents call it too, not
    // just the orchestrator — see the earlier discussion on pull-based
    // context).
    // private async pushToContextEngine(): Promise<void> {
    //     logger.warn(`[orchestrator] pushToContextEngine is a stub — ${this.context.length} summar(ies) for run ${this.runId} were not ingested`)
    // }

    // TODO (replan decision) — deterministic stub, no LLM call yet. Needs a
    // new BAML function once you're ready to add it, roughly:
    //
    //   function DecideRunContinuation(systemPrompt: string, completedLevel: ...,
    //     remainingTodos: PlannerTodo[], context: string) -> Continue | Replan | Abort
    //
    // Always returns Continue for now, which makes this loop behave exactly
    // like the old sequential DAG walk (minus the actual parallelism, see
    // above) — that's intentional so the rest of the flow is testable before
    // this exists.
    private async decideNextStep(_levelResults: { success: boolean }[], _remaining: PlannerTodo[]): Promise<RunDecision> {
        return { action: 'continue' }
    }

    private async runSubAgentWithRetry<T extends SubAgentType>(
        agentType: T, input: InputMap[T], sandbox: E2BSandbox, baseDir: string,
    ): Promise<{ success: boolean, summary: string }> {
        let result: { success: boolean, summary: string } = { success: false, summary: "" }
        for (let attempt = 1; attempt <= SUBAGENT_TASK_RETRY_ATTEMPTS; attempt++) {
            const subagent = new SubAgent(agentType, input, this.userId, this.projectId, this.runId, sandbox, baseDir)
            result = await subagent.runLoop()
            if (result.success) return result
            logger.warn(`${agentType} task failed (attempt ${attempt}/${SUBAGENT_TASK_RETRY_ATTEMPTS}): ${result.summary}`)
            startObservation(
                "subagent-task-retry",
                {input: {agentType, attempt, maxAttempts: SUBAGENT_TASK_RETRY_ATTEMPTS, summary: result.summary}},
                {asType: "event"}
            ).end()
            if (attempt < SUBAGENT_TASK_RETRY_ATTEMPTS) {
                await new Promise((resolve) => setTimeout(resolve, SUBAGENT_RETRY_BACKOFF_MS * attempt))
            }
        }
        return result
    }

    private async runLevel(taskIds: number[]): Promise<{ context: CallAgentContext[], state: SerializableState, results: { taskId: number, success: boolean, summary: string }[], taskFiles: Record<number, string[]> }> {
        
        return startActiveObservation("multi-agent-parallel-runner", 
            async (span): Promise<{ context: CallAgentContext[], state: SerializableState, results: { taskId: number, success: boolean, summary: string }[], taskFiles: Record<number, string[]> }> => {
            let context = this.context
            const state = this.state
            const results: { taskId: number, success: boolean, summary: string }[] = []
            const taskFiles: Record<number, string[]> = {}
            if (taskIds.length > 1) {
                span.update({statusMessage: `Spawning parallel subagents`})
                const sandbox = await this.reconnectSandbox()
                await this.worktreeGit.ensureRepo(sandbox)
                const spawned = await Promise.all(taskIds.map(async (taskId) => {
                    const todo = this.todos.find(t => t.id === taskId)
                    if (!todo || !todo.agent) return null
    
                    const taskSandbox = await this.reconnectSandbox()
                    const worktreePath = await this.worktreeGit.create(taskSandbox, taskId)
    
                    const input = this.buildSubAgentInput(todo.agent, todo, toCallAgentState(state))
                    const result = await this.runSubAgentWithRetry(todo.agent, input, taskSandbox, worktreePath)
    
                    return { taskId, todo, result, taskSandbox }
                }))
    
                for (const spawn of spawned) {
                    if (!spawn) continue
                    const { taskId, todo, result, taskSandbox } = spawn
                    let success = result.success
                    let summary = result.summary
    
                    if (success) {
                        const merge = await this.worktreeGit.merge(
                            taskSandbox, taskId,
                            { task: todo.task, summary: result.summary },
                            [...this.context, ...context],
                            taskFiles,
                        )
                        if (!merge.success) {
                            success = false
                            summary = `Task completed but its worktree failed to merge cleanly — likely a conflicting edit with another task in the same level (e.g. both wired into src/App.tsx): ${merge.content}`
                            startObservation(
                                "merge-conflict",
                                {input: {taskId, detail: merge.content}},
                                {asType: "event"}
                            ).end()
                            span.update({level: "ERROR"})
                            logger.error(`Merge conflict for task ${taskId}: ${merge.content}`)
                        } else {
                            taskFiles[taskId] = merge.files
                        }
                    }
    
                    results.push({ taskId, success, summary })
                    context = [...context, { taskId, task: todo.task, agentAssigned: todo.agent!, success, summary }]
                }
            }
            else {
                span.update({statusMessage: `Spawning subagents sequentially`})
                for (const taskId of taskIds) {
                    const todo = this.todos.find(t => t.id === taskId)
                    if (!todo || !todo.agent) continue
    
                    const sandbox = await this.reconnectSandbox()
                    await this.worktreeGit.ensureRepo(sandbox)
    
                    const input = this.buildSubAgentInput(todo.agent, todo, toCallAgentState(state))
                    const result = await this.runSubAgentWithRetry(todo.agent, input, sandbox, PROJECT_ROOT)
    
                    results.push({ taskId, success: result.success, summary: result.summary })
                    context = [...context, { taskId, task: todo.task, agentAssigned: todo.agent, success: result.success, summary: result.summary }]
                    if (result.success) taskFiles[taskId] = []
                }
            }
            return { context, state, results, taskFiles }

        })


    }

    private async runMergeGate(taskFiles: Record<number, string[]>): Promise<{ success: boolean, state: SerializableState, summaries: string[] }> {
        let state = this.state
        const summaries: string[] = []

        const preDeployCheck = async (sandbox: E2BSandbox): Promise<boolean> => {
            const buildResult = await sandbox.Execute(sandbox.sandboxId, { action: 'runCommand', command: 'npm run build' })
            if (!buildResult.success) {
                state = { ...state, lastTestErrors: [...state.lastTestErrors, { fileName: "BUILD_CHECKER_ERROR", error: buildResult.stderr ?? "Unknown build error", source: 'build' }], lastToolResult: { success: false } }
                return false
            }
            return true
        }

        let sandbox = await this.reconnectSandbox()
        let deployReady = await preDeployCheck(sandbox)
        const testerContext: TesterContext = {
            skills: [...(await this.skillStore.globalSkills('tester')), ...(await this.skillStore.getRoleSkills('tester')), ...(await this.skillStore.getTaskSkillsFull('tester'))],
        }

        let previousErrorSignature: string | null = null
        let repeatCount = 0
        let loopCount = 0

        return startActiveObservation("multi-agent-runMergeGate", async (span) => {
            while (loopCount < TESTER_DEBUGGER_LOOP_MAX_ITERATIONS && !deployReady) {
                sandbox = await this.reconnectSandbox()
                startObservation(
                    "tester-iteration",
                    {input: {loopCount, maxIterations: TESTER_DEBUGGER_LOOP_MAX_ITERATIONS}},
                    {asType: "event"}
                ).end()
                const tester = new TesterAgent(this.userId, this.projectId, sandbox)
                await this.emitter.emit({ type: 'subagent_started', agent: 'tester', task: 'Verifying the build' })
                const testerRes: TesterResponse = await tester.testCodebase(testerContext)
                await this.emitter.emit({ type: 'subagent_completed', agent: 'tester', summary: testerRes.success ? 'Build verified' : 'Build check failed', success: testerRes.success })
                
                const taskFileEntries = Object.entries(taskFiles)
                const owningTask = taskFileEntries.length === 1
                    ? Number(taskFileEntries[0]![0])
                    : taskFileEntries.find(([, files]) => files.includes(testerRes.errorRes?.file ?? ''))?.[0]
    
                const error: AgentError = testerRes.errorRes
                    ? { fileName: testerRes.errorRes.file, error: `${testerRes.errorRes.error} (line ${testerRes.errorRes.line})`, source: 'tester', taskId: owningTask !== undefined ? Number(owningTask) : undefined }
                    : state.lastTestErrors[state.lastTestErrors.length - 1] ?? { fileName: "BUILD_CHECKER_ERROR", error: "build failed but neither the build nor the tester reported specifics", source: 'build' }
    
                const currentErrorSignature = `${error.fileName}:${error.error}`
                if (currentErrorSignature === previousErrorSignature) {
                    repeatCount++
                    if (repeatCount >= 2) return { success: false, state, summaries }
                } else {
                    repeatCount = 0
                }
                previousErrorSignature = currentErrorSignature
                state = { ...state, lastTestErrors: [...state.lastTestErrors, error] }
    
                const debugTodo = { task: "", id: Math.floor(Math.random() * 1000) + 1000, dependency: [] }
                const debuggerInput = this.buildSubAgentInput('debuggerr', debugTodo, toCallAgentState(state))
                const debuggerResult = await this.runSubAgentWithRetry('debuggerr', debuggerInput, sandbox, PROJECT_ROOT)
                await sandbox.SyncR2()
    
                state = { ...state, lastToolResult: { success: debuggerResult.success } }
                summaries.push(debuggerResult.summary)
                deployReady = await preDeployCheck(sandbox)
                loopCount++
            }
            return { success: deployReady, state, summaries }
        })


    }

    private async commitState(results: { taskId: number, summary: string }[]): Promise<void> {
        for (const r of results) {
            await backendGql(
                `mutation SaveTaskSummary($projectId: ID!, $runId: ID!, $taskId: Int!, $summary: String!) {
                    saveTaskSummary(projectId: $projectId, runId: $runId, taskId: $taskId, summary: $summary) { id }
                }`,
                { projectId: this.projectId, runId: this.runId, taskId: r.taskId, summary: r.summary },
            ).catch(e => logger.error(`Failed to save summary for task ${r.taskId}: ${e}`))
        }
    }

    async Execute(step: StepRunner): Promise<{ status: 'completed' | 'error', summary?: string, todos?: PlannerTodo[], reason?: string }> {
        
        const planner = new Planner(this.userId, this.projectId, this.runId)

        // Call 1: enumerate screens (cheap) — unblocks the design phase.
        const screens = await step.run("enumerate-screens", () =>
            planner.enumerateScreens(this.updatedPrompt, this.priorContext)) as unknown as PlannedScreen[]

        // plan-tasks (Call 2) and the Stitch design pre-phase both depend only on
        // the screen list, so run them as concurrent steps — plan-tasks hides
        // under the ~56s design wait. The design step reconnects the sandbox
        // inside itself so the reconnect only runs when the step actually
        // executes, not on every Inngest replay.
        const [todos, designResults] = await Promise.all([
            step.run("plan-tasks", () =>
                planner.planTasks(this.updatedPrompt, this.priorContext, screens)),
            step.run("generate-designs", async () => {
                const sandbox = await this.reconnectSandbox()
                return planner.generateDesigns(screens, sandbox)
            }),
        ]) as [PlannerTodo[], DesignResult[]]
        this.todos = todos

        const degraded = designResults.filter((d) => d.status === 'degraded')
        if (degraded.length > 0) {
            // Not fatal: these screens' uiExpert items fall back to a design-less
            // build (Phase 4). Surfaced so a run isn't silently lower-fidelity.
            logger.warn(`Design pre-phase: ${degraded.length}/${designResults.length} screen(s) degraded (built design-less): ${degraded.map((d) => d.screenId).join(', ')}`)
        }

        const dag = new DAG(this.todos)
        const levels = dag.TopologicalSortParallel()
        for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
            const taskIds = levels[levelIndex]!
            
            const levelOut = await step.run(`level-${levelIndex}-spawn`, () => this.runLevel(taskIds)) as unknown as {
                context: CallAgentContext[], state: SerializableState, results: { taskId: number, success: boolean, summary: string }[], taskFiles: Record<number, string[]>
            }
            this.context = levelOut.context
            this.state = levelOut.state

            const failedTasks = levelOut.results.filter(r => !r.success)
            if (failedTasks.length > 0) {
                const reason = `Task(s) ${failedTasks.map(t => t.taskId).join(', ')} failed after ${SUBAGENT_TASK_RETRY_ATTEMPTS} attempt(s) in level ${levelIndex}: ${failedTasks.map(t => t.summary).join(' | ')}`
                await step.run(`level-${levelIndex}-emit-run-failed`, () => this.emitter.emit({ type: 'run_failed', error: reason }))
                return { status: 'error', reason }
            }
            const gateOut = await step.run(`level-${levelIndex}-merge-gate`, () => this.runMergeGate(levelOut.taskFiles)) as unknown as {
                success: boolean, state: SerializableState, summaries: string[]
            }
            this.state = gateOut.state
            this.allSummaries.push(...gateOut.summaries)
            if (!gateOut.success) {
                const reason = `Merge gate failed after level ${levelIndex}`
                await step.run(`level-${levelIndex}-emit-run-failed`, () => this.emitter.emit({ type: 'run_failed', error: reason }))
                return { status: 'error', reason }
            }

            await step.run(`level-${levelIndex}-commit-state`, () => this.commitState(levelOut.results))
            // await step.run(`level-${levelIndex}-context-engine-push`, () => this.pushToContextEngine())

            const remaining = this.todos.filter(t => !this.context.some(c => c.taskId === t.id))
            const decision = await step.run(`level-${levelIndex}-decide`, () => this.decideNextStep(levelOut.results, remaining))
            if (decision.action === 'abort') {
                await step.run(`level-${levelIndex}-emit-run-failed`, () => this.emitter.emit({ type: 'run_failed', error: decision.reason }))
                return { status: 'error', reason: decision.reason }
            }
            // #TODO: decision.action === 'replan' to be completed midway. 
        }
        const summary = await step.run("summarize", () =>
            startActiveObservation("multi-agent-summarize", async (span): Promise<string> => {
                span.update({input: {summaries: this.allSummaries.length}})
                const out = await observeBaml(
                    "summarize-llm",
                    {summaries: this.allSummaries.length},
                    (opts) => b.CallAgentSummary(CALL_AGENT_SUMMARY_PROMPT, this.allSummaries, opts),
                )
                span.update({output: out})
                return out
            })
        ) as string
        logger.info(`Orchestrator run ${this.runId} completed`)
        return { status: 'completed', summary, todos: this.todos }
    }
}

/*Ideas

- can this happend that planner plans and then assign the subagents it's tasks according to dag and then it waits till their response get completed
and wait till they can do their work? 
- probably do toerh things like the merge worktree and context resolution and other things? 
- probably replan mid way according to the filaures it facing? 
- analyzing the result of subagents and then replanning or changing the context accordingly or spawning the subagents for fixing the mistake? 
- how do inngest or langraph agents handles retries? 
- Hey shouldn't my agent be self healing?
- Shouldn't this be a graph flow? since it's a complex yet long running i.e. approx 10 mins

Props of this orchestrator: 
- observation and analysis of result by subagents. 
- Storing artifacts generated midway along with the summary of the subagent. 
- Should be stateful.


Todo list for later (say which one when ready):

DONE:
- state.screenId / screenIdByTaskId removed entirely (was never assigned, and
  the fields that read it — coder's relatedDesignRef, uiExpert's
  screenId/mode/referenceScreenIds — were never consumed downstream either).
  Coder discovers prior screens by reading the sandbox instead.
- Worktree isolation — real now. E2BSandbox.resolvePath/Execute/getRepoTree
  take a required baseDir; size-1 levels use PROJECT_ROOT, size 2+ levels run
  concurrently in per-task worktrees, merged back one at a time. node_modules
  symlinked into new worktrees. A merge conflict aborts cleanly and marks
  that task failed rather than corrupting trunk or silently ignoring it.
- makingPromise stub removed (was empty, no TODO tag, dead code).
- Complexity/clarification decoupled into independent BAML calls
  (CheckComplexity / GenerateClarifyingQuestions) — a simple request can now
  get clarifying questions, a complex one can sail through unambiguous.
  Clarification prompt covers "what is this person actually building"
  ambiguity (including UI mood/direction) as one eligible category — never
  gated to UI requests, never mandatory, never asked per-screen inside an
  already-planned complex build (UIExpert decides that itself at build time).
- relatedDesignRef (coder) and referenceScreenIds (uiExpert) removed from
  SubAgentTodoDataMap — were never consumed by either subagent, redundant
  with reading the sandbox directly.
- Frontend: three generated designs not visible at selection time — root
  cause was the picker's iframe sandbox="" blocking the Tailwind CDN script
  the Stitch HTML depends on; fixed to sandbox="allow-scripts".
- Subagent task failure/retry: runSubAgentWithRetry retries a fully-failed
  subagent run (max iterations / abort / haltTask) with a fresh instance;
  Execute() now aborts the run on a still-failed task instead of silently
  continuing to the next level.
- PlannerTodo.agent narrowed to "coder" | "uiExpert" in agents.baml — tester
  and researcher were never planner-assignable in practice (prompt already
  said so), the type now enforces it; buildSubAgentInput's dead tester/
  researcher cases removed.
- Debugger error-parsing bugs: DebuggerContext.originalError was always ""
  on the only live path (runMergeGate's synthetic todo has task: ""), fixed
  to derive from the actual errors array; tester error + line number were
  being string-concatenated with no separator ("message42"), fixed to a
  readable "message (line 42)"; AgentError.source was declared but never set.
- errorsByTaskId removed entirely (was declared, converted, never populated
  or read) in favor of real per-task error attribution: mergeWorktree now
  commits each worktree before merging (nothing did before — merges were
  silently discarding uncommitted task output) and captures a
  taskId->changedFiles diff; runMergeGate matches a failing error's fileName
  against that map and stamps AgentError.taskId, which debuggerAgent.baml's
  Error class and prompt now surface as a hint to the debugger.

STILL PENDING:
- RESOLVED by the two-phase planner: EnumerateScreens fixes the screen list
  and generateDesigns produces each screen's design up front, keyed by
  screen id; PLAN_TASKS_PROMPT's uiExpert items reference that id via
  designRef, so design is scoped per-item now instead of unaddressed.
- RUN_MAX_LLM_CALLS = 120 — commented as "the money guard," never actually
  enforced anywhere.
- Model choice (client OpenAI → gpt-4o-mini) pinned across every BAML
  function including the planner — likely root cause of shallow/few-todo
  decomposition vs. what you saw in ChatGPT/DeepSeek UI. Suggested test: swap
  just PlanComplexTask's client to CustomGPT5Mini/CustomSonnet4 and rerun
  unchanged prompt.
- Other TODOs outside orchestrator.ts (subAgent.ts, callAgent.ts, context.ts,
  debugger.ts) — not yet inventoried in detail.
*/