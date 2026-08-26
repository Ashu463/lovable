// New orchestrator loop — replaces the `else` (complex/DAG) branch of
// CallAgent.Execute in callAgent.ts. Read this file next to that block; most
// of what's below is that logic reshaped around Inngest steps, not reinvented.
//
// What's REAL here (works, typechecks, mostly lifted from callAgent.ts):
//   - planning, DAG leveling, subagent spawn, tester/debugger merge gate,
//     state/context bookkeeping, run summary.
//   - git worktree isolation for parallel same-level tasks (runLevel):
//     size-1 levels run directly against PROJECT_ROOT (no isolation needed,
//     nothing to collide with); size 2+ levels run concurrently, each task
//     in its own worktree, merged back to trunk one at a time afterward. A
//     real merge conflict (e.g. two UI tasks both wiring into src/App.tsx)
//     surfaces as that task's result being marked failed, not silently lost.
// What's a STUB (interface only, marked TODO, does not silently pretend to work):
//   - context engine push/pull
//   - the LLM continue/replan/abort decision at each level boundary

import { Inngest, type GetStepTools } from "inngest"
import { b } from "../baml_client"
import type { Error as AgentError, PlannerTodo, ToolResult } from "../baml_client/types"
import type { TesterContext } from "../baml_client"
import { DAG } from "./services/dag"
import { E2BSandbox } from "./utils/sandbox"
import { SubAgent } from "./subAgent"
import { TesterAgent, type TesterResponse } from "./subagents/tester"
import type { InputMap, SubAgentType } from "../types/subAgentsTypes"
import type { CallAgentContext, CallAgentState } from "./callAgent"
import { PLAN_TASK_SYSTEM_PROMPT, CALL_AGENT_SUMMARY_PROMPT } from "./config/systemPrompts"
import { TESTER_DEBUGGER_LOOP_MAX_ITERATIONS, PROJECT_ROOT, SANDBOX_HOME } from "./config/systemConfig"
import { backendGql } from "./utils/backendClient"
import { createRunEmitter, type EventEmitter } from "./events"
import { logger } from "./utils/logger"
import { SkillStore } from "./skills"

export const inngest = new Inngest({ id: "lovable-agents" })

// ---------------------------------------------------------------------------
// State that has to survive a step boundary must be JSON-serializable —
// Inngest memoizes every step.run() return value as JSON, and a Map comes
// back as `{}`. CallAgentState (imported above) uses Maps because the old
// in-process loop never crossed a serialization boundary; this loop does, on
// every step. So level-to-level state on the class is a plain, serializable
// shape, and only gets converted into the Map-shaped CallAgentState right
// before a subagent's input is built inside a single step callback — never
// stored on `this` in Map form.
// ---------------------------------------------------------------------------
type SerializableState = {
    lastTestErrors: AgentError[]
    lastToolResult: ToolResult | null
    errorsByTaskId: Record<number, AgentError[]>
}

function toCallAgentState(s: SerializableState): CallAgentState {
    return {
        lastTestErrors: s.lastTestErrors,
        lastToolResult: s.lastToolResult,
        lastError: s.lastTestErrors[s.lastTestErrors.length - 1] ?? null,
        errorsByTaskId: new Map(Object.entries(s.errorsByTaskId).map(([k, v]) => [Number(k), v])),
    }
}

type RunDecision = { action: 'continue' } | { action: 'replan' } | { action: 'abort', reason: string }

export class Orchestrator {
    private context: CallAgentContext[] = []
    private state: SerializableState = { lastTestErrors: [], lastToolResult: null, errorsByTaskId: {} }
    private todos: PlannerTodo[] = []
    private allSummaries: string[] = []
    private emitter: EventEmitter
    private skillStore: SkillStore = new SkillStore()

    constructor(
        private userId: string,
        private projectId: string,
        private runId: string,
        private sandboxId: string,
        private semanticMem: string,
        private selectedDesign: string,
        private updatedPrompt: string,
        private priorContext: string,
    ) {
        this.emitter = createRunEmitter(runId)
    }

    private async reconnectSandbox(): Promise<E2BSandbox> {
        return E2BSandbox.StartSandbox(this.userId, this.projectId, this.sandboxId)
    }

    private buildSubAgentInput<T extends SubAgentType>(agentType: T, todo: PlannerTodo, state: CallAgentState): InputMap[T] {
        const base = { taskId: todo.id, task: todo.task, dependentTasks: todo.dependency, designNeeded: todo.designNeeded }
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
                } as unknown as InputMap[T]
            case 'tester':
                return { task: { ...base, agentType: 'tester', agentSpecificData: {} }, agentType: 'tester' } as unknown as InputMap[T]
            case 'debuggerr':
                if (!state.lastToolResult) throw new Error(`debuggerr input requested without a last tool result`)
                return {
                    task: { ...base, agentType: 'debuggerr', agentSpecificData: {} },
                    agentType: 'debuggerr',
                    callAgentContext: this.context,
                    semanticMem: this.semanticMem,
                    designNeeded: todo.designNeeded,
                    errors: state.lastTestErrors,
                    toolResult: state.lastToolResult,
                } as unknown as InputMap[T]
            case 'researcher':
                return {
                    task: { ...base, agentType: 'researcher', agentSpecificData: { query: todo.task, maxResults: 5 } },
                    agentType: 'researcher',
                } as unknown as InputMap[T]
            default:
                throw new Error(`no input builder for ${agentType}`)
        }
    }

    // -------------------------------------------------------------------------
    // Worktree isolation for parallel same-level tasks. A DAG level is a set
    // of tasks with no dependency edges between them, but that does NOT mean
    // their file operations are disjoint — every UI-touching task is required
    // (ui-base-template skill) to wire into src/App.tsx, so two UI tasks in
    // the same level are near-guaranteed to touch the same file. Isolation
    // via worktrees prevents them from clobbering each other's writes while
    // running; the merge step below is where an actual App.tsx-level
    // conflict between them would surface — handled as a failed task, not
    // silently ignored (see mergeWorktree).
    // -------------------------------------------------------------------------
    private async ensureGitRepo(sandbox: E2BSandbox): Promise<void> {
        const check = await sandbox.Execute(sandbox.sandboxId, { action: 'runCommand', command: `test -d ${PROJECT_ROOT}/.git && echo yes || echo no` })
        if (check.content.includes('no')) {
            await sandbox.Execute(sandbox.sandboxId, {
                action: 'runCommand',
                command: `git init -q && git add -A && git -c user.email=agent@lovable.dev -c user.name=lovable-agent commit -q -m "bootstrap" --allow-empty`,
            })
        }
    }

    // node_modules is untracked, so a fresh `git worktree add` checkout
    // doesn't have it — symlinking it in is far cheaper than a second
    // `npm install` per task, and dependencies don't change mid-run.
    private async createWorktree(sandbox: E2BSandbox, taskId: number): Promise<string> {
        const path = `${SANDBOX_HOME}/worktrees/task-${taskId}`
        await sandbox.Execute(sandbox.sandboxId, {
            action: 'runCommand',
            command: `git -C ${PROJECT_ROOT} worktree add -q ${path} -b task-${taskId} && ln -s ${PROJECT_ROOT}/node_modules ${path}/node_modules`,
        })
        return path
    }

    // On a real conflict (e.g. two tasks both edited src/App.tsx), `git
    // merge` exits non-zero and leaves trunk mid-merge with conflict markers
    // in the working tree — `merge --abort` puts trunk back exactly as it
    // was before this attempt, so a failed task never corrupts other tasks'
    // already-merged work. The worktree itself is left in place on failure
    // (not removed) so its branch and diff are still inspectable afterward.
    private async mergeWorktree(sandbox: E2BSandbox, taskId: number): Promise<{ success: boolean, content: string }> {
        const merge = await sandbox.Execute(sandbox.sandboxId, {
            action: 'runCommand',
            command: `git -C ${PROJECT_ROOT} merge --no-edit task-${taskId} || (git -C ${PROJECT_ROOT} merge --abort; exit 1)`,
        })
        if (!merge.success) {
            return { success: false, content: merge.content }
        }
        const cleanup = await sandbox.Execute(sandbox.sandboxId, {
            action: 'runCommand',
            command: `git -C ${PROJECT_ROOT} worktree remove -f ${SANDBOX_HOME}/worktrees/task-${taskId}`,
        })
        return { success: true, content: cleanup.content }
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

    private async plan(): Promise<PlannerTodo[]> {
        const planned = await b.PlanComplexTask(PLAN_TASK_SYSTEM_PROMPT, this.updatedPrompt, this.priorContext)
        await backendGql(
            `mutation SaveTodos($projectId: ID!, $runId: ID!, $todos: [PlannedTodoInput!]!) {
                saveTodos(projectId: $projectId, runId: $runId, todos: $todos) { id taskId }
            }`,
            { projectId: this.projectId, runId: this.runId, todos: planned },
        ).catch(e => logger.error(`Failed to save todos for run ${this.runId}: ${e}`))
        return planned
    }

    // One level of the DAG. A level of size 1 runs directly against
    // PROJECT_ROOT — there's nothing to isolate it from, so a worktree would
    // be pure overhead (create + merge + remove, on top of zero collision
    // risk). A level with 2+ tasks runs them concurrently, each in its own
    // git worktree so their file operations can't collide while in flight;
    // merging back to trunk happens after, one at a time (git can't merge
    // multiple branches in a single atomic step even though the work itself
    // ran in parallel) — see mergeWorktree for what happens if two tasks
    // conflict on the same file.
    private async runLevel(taskIds: number[]): Promise<{ context: CallAgentContext[], state: SerializableState, results: { taskId: number, success: boolean, summary: string }[] }> {
        let context = this.context
        const state = this.state
        const results: { taskId: number, success: boolean, summary: string }[] = []

        if (taskIds.length > 1) {
            const sandbox = await this.reconnectSandbox()
            await this.ensureGitRepo(sandbox)

            const spawned = await Promise.all(taskIds.map(async (taskId) => {
                const todo = this.todos.find(t => t.id === taskId)
                if (!todo || !todo.agent) return null

                const taskSandbox = await this.reconnectSandbox()
                const worktreePath = await this.createWorktree(taskSandbox, taskId)

                const input = this.buildSubAgentInput(todo.agent, todo, toCallAgentState(state))
                const subagent = new SubAgent(todo.agent, input, this.userId, this.projectId, this.runId, taskSandbox, this.selectedDesign, worktreePath)
                const result = await subagent.runLoop()

                return { taskId, todo, result, taskSandbox }
            }))

            for (const spawn of spawned) {
                if (!spawn) continue
                const { taskId, todo, result, taskSandbox } = spawn
                let success = result.success
                let summary = result.summary

                if (success) {
                    const merge = await this.mergeWorktree(taskSandbox, taskId)
                    if (!merge.success) {
                        success = false
                        summary = `Task completed but its worktree failed to merge cleanly — likely a conflicting edit with another task in the same level (e.g. both wired into src/App.tsx): ${merge.content}`
                        logger.error(`Merge conflict for task ${taskId}: ${merge.content}`)
                    }
                }

                results.push({ taskId, success, summary })
                context = [...context, { taskId, task: todo.task, agentAssigned: todo.agent!, success, summary }]
            }
        }
        else {
            for (const taskId of taskIds) {
                const todo = this.todos.find(t => t.id === taskId)
                if (!todo || !todo.agent) continue

                const sandbox = await this.reconnectSandbox()
                await this.ensureGitRepo(sandbox)

                const input = this.buildSubAgentInput(todo.agent, todo, toCallAgentState(state))
                const subagent = new SubAgent(todo.agent, input, this.userId, this.projectId, this.runId, sandbox, this.selectedDesign, PROJECT_ROOT)
                const result = await subagent.runLoop()

                results.push({ taskId, success: result.success, summary: result.summary })
                context = [...context, { taskId, task: todo.task, agentAssigned: todo.agent, success: result.success, summary: result.summary }]
            }
        }

        return { context, state, results }
    }

    private async runMergeGate(): Promise<{ success: boolean, state: SerializableState, summaries: string[] }> {
        let state = this.state
        const summaries: string[] = []

        const preDeployCheck = async (sandbox: E2BSandbox): Promise<boolean> => {
            const buildResult = await sandbox.Execute(sandbox.sandboxId, { action: 'runCommand', command: 'npm run build' })
            if (!buildResult.success) {
                state = { ...state, lastTestErrors: [...state.lastTestErrors, { fileName: "BUILD_CHECKER_ERROR", error: buildResult.stderr ?? "Unknown build error" }], lastToolResult: { success: false } }
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

        while (loopCount < TESTER_DEBUGGER_LOOP_MAX_ITERATIONS && !deployReady) {
            sandbox = await this.reconnectSandbox()
            const tester = new TesterAgent(this.userId, this.projectId, sandbox)
            const testerRes: TesterResponse = await tester.testCodebase(testerContext)

            const error: AgentError = testerRes.errorRes
                ? { fileName: testerRes.errorRes.file, error: testerRes.errorRes.error + testerRes.errorRes.line }
                : state.lastTestErrors[state.lastTestErrors.length - 1] ?? { fileName: "BUILD_CHECKER_ERROR", error: "build failed but neither the build nor the tester reported specifics" }

            const currentErrorSignature = `${error.fileName}:${error.error}`
            if (currentErrorSignature === previousErrorSignature) {
                repeatCount++
                if (repeatCount >= 2) return { success: false, state, summaries }
            } else {
                repeatCount = 0
            }
            previousErrorSignature = currentErrorSignature
            state = { ...state, lastTestErrors: [...state.lastTestErrors, error] }

            const debugTodo: PlannerTodo = { task: "", id: Math.floor(Math.random() * 1000) + 1000, dependency: [], agent: 'debuggerr', status: 'pending', designNeeded: false }
            const debuggerInput = this.buildSubAgentInput('debuggerr', debugTodo, toCallAgentState(state))
            const debuggerAgent = new SubAgent('debuggerr', debuggerInput, this.userId, this.projectId, this.runId, sandbox, this.selectedDesign, PROJECT_ROOT)
            const debuggerResult = await debuggerAgent.runLoop()
            await sandbox.SyncR2()

            state = { ...state, lastToolResult: { success: debuggerResult.success } }
            summaries.push(debuggerResult.summary)
            deployReady = await preDeployCheck(sandbox)
            loopCount++
        }

        return { success: deployReady, state, summaries }
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

    async Execute(step: GetStepTools<typeof inngest>): Promise<{ status: 'completed' | 'error', summary?: string, todos?: PlannerTodo[], reason?: string }> {
        this.todos = await step.run("plan", () => this.plan()) as unknown as PlannerTodo[]

        const dag = new DAG(this.todos)
        const levels = dag.TopologicalSortParallel()

        for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
            const taskIds = levels[levelIndex]!
            
            const levelOut = await step.run(`level-${levelIndex}-spawn`, () => this.runLevel(taskIds)) as unknown as {
                context: CallAgentContext[], state: SerializableState, results: { taskId: number, success: boolean, summary: string }[]
            }
            this.context = levelOut.context
            this.state = levelOut.state

            // Both coder and uiExpert write files into the sandbox now, so both
            // need the post-level build check + sync — a UI-only level was
            // previously skipping this entirely, meaning its files never got a
            // build check or an R2 sync until some later coder-containing level
            // happened to trigger one.
            const hadFileWritingTask = taskIds.some(id => {
                const agent = this.todos.find(t => t.id === id)?.agent
                return agent === 'coder' || agent === 'uiExpert'
            })
            if (hadFileWritingTask) {
                const gateOut = await step.run(`level-${levelIndex}-merge-gate`, () => this.runMergeGate()) as unknown as {
                    success: boolean, state: SerializableState, summaries: string[]
                }
                this.state = gateOut.state
                this.allSummaries.push(...gateOut.summaries)
                if (!gateOut.success) {
                    await this.emitter.emit({ type: 'run_failed', error: `Merge gate failed after level ${levelIndex}` })
                    return { status: 'error', reason: `Merge gate failed after level ${levelIndex}` }
                }
            }

            await step.run(`level-${levelIndex}-commit-state`, () => this.commitState(levelOut.results))
            // await step.run(`level-${levelIndex}-context-engine-push`, () => this.pushToContextEngine())

            const remaining = this.todos.filter(t => !this.context.some(c => c.taskId === t.id))
            const decision = await step.run(`level-${levelIndex}-decide`, () => this.decideNextStep(levelOut.results, remaining))
            if (decision.action === 'abort') {
                await this.emitter.emit({ type: 'run_failed', error: decision.reason })
                return { status: 'error', reason: decision.reason }
            }
            // decision.action === 'replan' has no handler yet — decideNextStep
            // never returns it today (see TODO above), so this is unreachable
            // until that stub is replaced with a real LLM call.
        }

        const summary = await step.run("summarize", () => b.CallAgentSummary(CALL_AGENT_SUMMARY_PROMPT, this.allSummaries))
        await this.emitter.emit({ type: 'call_agent_completed', summary })
        return { status: 'completed', summary, todos: this.todos }
    }
}

type RunEventData = {
    userId: string
    projectId: string
    runId: string
    sandboxId: string
    semanticMem: string
    selectedDesign: string
    updatedPrompt: string
    priorContext: string
}

export const runComplexTaskFn = inngest.createFunction(
    { id: "run-complex-task", triggers: [{ event: "callAgent/run.complex" }] },
    async ({ event, step }) => {
        const data = event.data as RunEventData
        const orchestrator = new Orchestrator(
            data.userId, data.projectId, data.runId, data.sandboxId,
            data.semanticMem, data.selectedDesign, data.updatedPrompt, data.priorContext,
        )
        return await orchestrator.Execute(step)
    },
)

export const functions = [runComplexTaskFn]

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

STILL PENDING:
- errorsByTaskId in orchestrator.ts/callAgent.ts — declared, converted, never
  populated or read. Dead state. (Noted in tester-fixing.md as related to
  that spec's DebuggerContext extension — worth doing together.)
- PLAN_TASK_SYSTEM_PROMPT has zero mention of the selected design — planner
  never scopes a dedicated todo around implementing it.
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