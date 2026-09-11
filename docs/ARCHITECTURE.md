# Architecture & Design Log

This document is a deep, code-grounded snapshot of what's been built here as of **2026-09-06**
(160 commits, started **2026-06-27**, ~10 weeks). It exists to (a) give you a single source of
truth for how the system actually works today, and (b) be raw material for interview prep —
every section below is something you can talk through with file:line evidence, not vibes.

The product: a Lovable/v0-style "describe an app, watch an AI agent build it" tool — chat in,
live DAG of an AI team (planner, coder, debugger, tester, UI designer) building a real React app
in a sandbox, streamed back live, with a working preview at the end.

---

## 1. The three workspaces, one sentence each

- **`apps/frontend`** — React 19 + Vite SPA. Chat + a live DAG visualization of the build +
  code viewer + preview iframe.
- **`apps/backend`** — Apollo GraphQL server (Express), Postgres/Prisma, BullMQ for job intake,
  a second Inngest HTTP server for step-function execution, Langfuse/OTel for tracing.
- **`packages/agents`** — the actual AI engine: orchestrator, two-phase planner, DAG executor,
  five subagent types, BAML-defined LLM calls, E2B sandbox + git-worktree isolation, R2 file
  storage. Both apps depend on it; neither reimplements its types.

---

## 2. How this grew (git-log-verified phases)

**Phase 0 — Bootstrapping (Jun 27 – Jul 3, ~4 commits).** Init, wiring, "errors exist in this
commit, not ready for testing yet." No structure yet, just getting something to compile.

**Phase 1 — One subagent at a time (Jul 5 – Jul 14).** Debugger, UI expert, tester built as
standalone pieces (`d876491`, `7c923ad`, `26adb4d`), then "main agent" (the simple-path
generalist loop) and finally a first orchestrator (`2e1e26b`, "Orchestrator done :), finally").
Context/session got split per-agent here (`4e2dd1f`, `f90db0c`) — the realization that each
subagent needs its own scoped context, not one shared blob, dates from this phase and still
holds today (`SubAgent.createContextManager`).

**Phase 2 — Backend + first frontend (Jul 14 – Jul 31).** Backend built from scratch as REST
(routes, Postgres, BullMQ queue setup — `a660c65`), E2B sandbox + R2 storage wired and tested,
a skills system extracted (`08b1be2`), and a frontend generated (explicitly, "Frontend added by
claude so fast, nothing tested don't merge it yet" — `df831ba`) then iterated into something
real. By `1e09079` ("Main agent is working fully") the simple path was E2E.

**Phase 3 — Parallelism + GraphQL migration (Aug 1 – Aug 12).** Topological-sort parallel DAG
execution landed (`11e44b9`, `6aa35fd`) — the first version of "independent tasks run
concurrently." In parallel, a deliberate REST→GraphQL migration started: `b96cb3a` "Shifting
REST to src2 and graphql to src" — the REST code wasn't deleted, it was frozen in place as
`src2` and ported domain-by-domain (`efe1d3f` users, `e617a54` run/project, `f217332`
question/design/chat), with SSE-over-GraphQL landing same week (`92e9882`). This is why
`apps/backend/src2` still exists today — it's a deliberate strangler-fig migration, not
neglect.

**Phase 4 — Isolation + real orchestration (Aug 15 – Aug 31).** This is where the system
became distributed-systems-shaped: git worktrees for per-task isolation (`60ed3a2`), the
orchestrator actually wired to subagents with retries (`c74269c`), LLM-based merge-conflict
resolution (`506e0e3`), and the UI split into simple-vs-complex flows with QnA decoupled from
complexity classification (`a8bdd65`) — the insight that "is this simple?" and "do I need to
ask a clarifying question?" are independent axes, not one gate.

**Phase 5 — Observability + planner rebuild (Sep 1 – Sep 6, current).** Langfuse tracing added
end to end, backend and agent side (`e9ffe1c`, `7c1abc0`, `bdb5bee`), then the planner was
rebuilt into the current two-phase design (`5446ce3`, "hybrid approach") and every system
prompt rewritten against a documented structure (`PROMPT_STRUCTURE.md`, `8f5fa4b`, `8896169`,
`52d708c`).

**Read on this**: the architecture below describes **Phase 5's end state**, not the path here —
but the path matters for an interview, because it shows the tradeoffs weren't accidents. The
mutex-free worktree-isolation model, the degrade-don't-throw pattern, the src2 strangler
migration — each replaced something that broke in an earlier phase.

---

## 3. Request flow, end to end

```
User types prompt (Workspace.tsx)
  → createRun mutation (GraphQL)
      → BullMQ: runQueue.add("run-agent", {...})     [durable job intake]
          → Worker (lib/worker.ts) boots/reconnects E2B sandbox
              → runCallAgent() IN-PROCESS import of packages/agents
                  → CallAgent.Execute()
                      → Bootstrap(): CheckComplexity ∥ GenerateClarifyingQuestions
                        (independent BAML calls — either can pause the run)
                      → [maybe pause here: clarification_needed / select_design /
                         ui_preference_needed — resolved via continueRun mutation,
                         same runId, re-attaches the SSE stream]
                      → inngest.send("callAgent/run.simple" | "callAgent/run.complex")
                          → SIMPLE: one Agent.runLoop(), step-wrapped
                          → COMPLEX: Orchestrator.Execute(step)
                              1. step "enumerate-screens"   (BAML EnumerateScreens)
                              2. step "plan-tasks" ∥ step "generate-designs"  (parallel —
                                 plan-tasks "hides under" the ~56s Stitch design wait)
                              3. DAG = TopologicalSortParallel(todos)   (Kahn's algorithm)
                              4. for each level:
                                   size 1  → run at PROJECT_ROOT directly
                                   size 2+ → each task gets its own git worktree,
                                             runs in Promise.all, merges back one at a time
                                             (LLM-resolves real conflicts, fails clean on
                                             binary/unhandled conflict shapes)
                                 → runMergeGate: npm run build; on failure, alternate
                                   Tester → Debugger up to 3x, halt if the error signature
                                   repeats twice unchanged (unfixable, don't loop forever)
                              5. step "summarize"  (BAML CallAgentSummary)
                      → finalizeRun(): fetch preview URL, emit run_completed
  → Every event emitted along the way (createRunEmitter) goes TWO places at once:
      - Postgres RunEvent row (durable, authoritative — also drives Run.status)
      - Redis pub/sub on `run:${runId}` (live fan-out)
  → Backend GraphQL Subscription.runEvents(runId), served over graphql-sse
    (SSE chosen over WebSocket specifically because SSE can carry an Authorization
    header in the request; WS handshake can't):
      replays past RunEvent rows first, then live-tails the Redis channel until a
      terminal event closes the stream
  → Frontend: single subscription in run.tsx feeds two sinks —
      - pause/terminal events → RunState transitions (drives which screen renders)
      - everything else → state.feed (raw event list)
          → DagView.tsx derives each task's pending/running/done/failed status by
            scanning feed for that taskId's subagent_started/completed events
            (Todo.status in the DB is never updated live — status is 100% client-derived)
          → non-subagent events also get turned into human-readable strings
            (describeEvent) for the chat activity log
```

Two queues, not one, and that's deliberate: **BullMQ** fronts the API and owns "is this run's
job still alive" (used to detect orphaned/stalled runs on page reload); **Inngest** owns
step-level checkpointing/retry *inside* one run so a crash mid-DAG doesn't redo finished work.
They're invoked from inside each other (BullMQ job → in-process call into packages/agents →
Inngest send), not layered as alternatives.

---

## 4. Data model (Postgres/Prisma, `apps/backend/prisma/schema.prisma`)

- **User** → owns **Project[]**. `semanticMem` field exists but is currently unused (memory/RAG
  is a stub — see §8).
- **Project** — caches `isComplex` so Bootstrap doesn't re-run that classification every
  message; owns **Run[]**, **Design[]**, **Question[]**, **UIPreferenceQuestion[]**.
- **Run** — one agent invocation. `RunStatus`: `IN_PROGRESS, CLARIFICATION_NEEDED,
  AWAITING_DESIGN_SELECTION, AWAITING_UI_PREFERENCE, COMPLETED, FAILED, STOPPED`. Self-referential
  `parentRunId` chains follow-up runs to their origin. `contextSnapshot`/`sessionSnapshot` are
  JSON blobs that make resume-after-refresh possible.
- **Todo** — one DAG node: `taskId`, `agent` (coder/debuggerr/tester/researcher/uiExpert),
  `dependency: Int[]` (the DAG edges), `agentSpecificData: Json?`. Has one **TaskSummary**.
- **Design** — a generated HTML screen variant, `isSelected` flag, keeps the prompt that made it.
- **Question**/**Answers** and **UIPreferenceQuestion**/**UIPreferenceAnswer** — two structurally
  identical but semantically separate gates: "do I understand the request" vs "what should this
  look like."
- **RunEvent** — append-only, `[runId, createdAt]` indexed. This one table is what makes SSE
  replay-on-reconnect and `runState` (resume-after-refresh) both work off the same data.

---

## 5. Design decisions and the tradeoff behind each

| Decision | Why, and what it costs |
|---|---|
| **Git worktrees instead of a mutex** for parallel task isolation | Each task in a DAG level gets `worktrees/task-{id}` on its own branch, `node_modules` symlinked in. No lock contention, tasks never see each other's half-written files. Cost: merge-back is now a real problem — handled with an LLM conflict resolver for content conflicts, but binary files and delete/add conflicts are explicitly **not** auto-resolved; that task fails clean instead of risking corrupting trunk. Orchestrator code says outright: no mutex exists, worktree isolation is what substitutes for one. |
| **Degrade-don't-throw** as a standing policy | Used in three unrelated places: Stitch design generation (a screen marked `degraded` after 3 failed retries doesn't sink the run), UIExpert's `Promise.allSettled` over 3 design variants (only throws if *all* fail), and merge conflicts (one task fails, its level's siblings don't). Philosophy stated directly in the planner: "Failure is a VALUE, not an exception." Cost: partial/degraded output is possible and has to be visible downstream (uiExpert has an explicit fallback path when a design is missing/degraded). |
| **Two separate job systems (BullMQ + Inngest)** instead of one | BullMQ is the durable front door (survives worker restarts, admin UI, backs the "is this run stalled" check). Inngest gives step-level memoized retry inside one run's execution graph. Splitting them means "the API accepted my job" and "this specific DAG level succeeded" are answerable independently. Cost: two retry vocabularies to reason about (`bullmq-retry` vs `inngest-retry`, both logged as separate trace events), and running both in local dev requires two processes. |
| **SSE over WebSocket for live progress** | GraphQL subscriptions transported over `graphql-sse`, chosen specifically because it POSTs the query body and can carry a normal `Authorization` header — a native WS handshake can't. Cost: no built-in reconnect; a dropped stream is currently terminal from the UI's perspective (see §7). |
| **Strangler-fig migration (`src2` REST → `src/graphql`)** instead of a rewrite-and-cutover | REST routers were frozen in place under `apps/backend/src2` and ported to GraphQL one domain at a time while both stayed mounted. Every domain now has a GraphQL counterpart and the frontend has fully cut over (no `/api/` calls left in frontend code) — `src2` is dead code kept mounted defensively, not because anything still calls it. Cost: two auth models coexisted for weeks; the GraphQL layer's ownership checks (`loadOwnedProject`/`loadOwnedRun`) are explicitly stronger than what REST ever verified — the migration was also a security fix, not just a format change. |
| **Two independent gates instead of one "do I understand this" gate** | `CheckComplexity` (simple vs complex build) and `GenerateClarifyingQuestions` run as independent BAML calls in `Bootstrap()`. A simple request can still get a clarifying question; a complex one can sail through unambiguous. Earlier phases conflated these into one classification step — splitting them was a deliberate Phase 4 change (`a8bdd65`, "Separated qna from complexity level"). |
| **Design pre-phase runs concurrently with task planning, not before it** | `plan-tasks` and `generate-designs` fire in `Promise.all`, justified in-code as "plan-tasks hides under the ~56s design wait" — the cheap LLM call is free real estate under the slow external Stitch API call. `enumerate-screens` still has to run first, sequentially, because both branches depend on a fixed screen list (so `designRef` in a planned task actually points at a real screen). |
| **Context is compacted, not just truncated** | `ContextManager`: lossless `CompactContext` (BAML-summarizes only the *older* half of history, keeps recent turns verbatim) first, then a lossy full-context `SummarizeContext` only if still over threshold (80% of the model's context window). Stale re-reads of the same file path are dropped outright before compaction even runs. Three separate summary prompts exist at three scopes (one subagent task / one simple-path run / one whole complex Run) specifically so a Run-level summary never loses the two facts that would compound an error if lost: the fixed design reference and the current delegate's resume pointer. |
| **`expectedToolCalls` is a soft budget, never a hard cap** | Prompt design decision, stated directly in `PROMPT_STRUCTURE.md`: cutting an agent off at a fixed tool-call count causes it to bail mid-task; the actual stall signal is *re-reading or re-running with no new information*, which the prompt is written to self-detect. Framing danger/irreversibility in a prompt was found to *cause* the over-caution it was meant to prevent — prompts instead emphasize the worktree/merge-gate safety net to encourage the agent to act. |
| **Deterministic error-signature comparison to halt the debug loop** | Tester/Debugger alternate up to 3 times; if the same `${fileName}:${error}` string repeats twice, the loop halts as unfixable rather than burning more calls. This only works because the error-reframing prompt is deliberately engineered so two runs of the identical bug produce byte-identical error text — a prompt-engineering detail in service of a control-flow guarantee. |

---

## 6. Edge cases handled (with the actual mechanism)

- **Sandbox dies mid-run** (E2B's own TTL cap) — `EnsureAlive()`/`replaceSandbox()` detect it,
  transparently create a fresh sandbox and restore file state from R2; concurrent callers share
  one in-flight "recovering" promise so two tasks don't race a double-replace.
- **Vite preview returns 403 through the E2B proxy** — a genuinely non-obvious infra bug: Vite
  always answers `localhost` with 200 but 403s the proxied host header unless `allowedHosts` is
  widened; the fix detects the 403 specifically and restarts Vite with that config open.
- **A run gets orphaned** (worker crashed, job never finished) — `runState` cross-checks BullMQ's
  own queue (`waiting/active/delayed`) against a DB row still marked `IN_PROGRESS`; if no job
  backs it, it's reported `stalled` instead of hanging the UI forever.
- **Page refresh mid-build** — `Run.contextSnapshot`/`sessionSnapshot` plus the full `RunEvent`
  history let `resume(runId)` rehydrate UI state and re-attach the live stream (which replays
  missed events from Postgres before tailing Redis for new ones).
- **Design selection / question answering races** — `selectDesign` flips the selected flag
  inside one Postgres transaction so a crash never leaves zero designs selected; `answerQuestions`
  validates every question id exists before writing any answer, so a bad id fails the whole batch
  instead of partially applying.
- **Two runs finish and both try to name a project** — `nameProjectIfUnnamed` uses a conditional
  `updateMany` (`where name: null`), so only the first writer wins; the second is a silent no-op.
- **`continueRun` fails to re-enqueue after flipping status to `IN_PROGRESS`** — the resolver
  rolls the status back so the client can retry cleanly instead of leaving the row stuck.
- **Merge conflict during worktree merge-back** — classified by porcelain status code; content
  conflicts get an LLM resolver per file, binary/delete-vs-edit conflicts are refused rather
  than guessed at, and that one task is marked failed instead of corrupting trunk.
- **Debug loop that isn't converging** — halted after two repeats of the same error signature
  (see table above), rather than burning the whole retry budget on an unfixable bug.
- **SSE stream drops** — currently the honest gap, not a handled case: no reconnect/backoff
  exists; the UI reports "Lost connection to the build stream" and the run has to be resubmitted.
  Worth knowing this is a known, not accidental, limitation if asked about it.

---

## 7. Observability

Langfuse + OpenTelemetry, threaded across three separate processes that don't share memory (a
BullMQ job, an Inngest HTTP call for planning, separate Inngest HTTP calls per DAG level): a
deterministic `traceId`/`spanId` is derived from the `runId` itself (hash-based, same input →
same id anywhere), so every span from every process lands in one trace regardless of which
process or replay produced it. Every BAML call is wrapped (`observeBaml`) to capture model,
token usage (cached vs not), provider, attempt count, duration. Discrete decisions — a retry, a
halt, a degrade, a merge conflict, a reused cached answer — are emitted as one-off Langfuse
events, not just log lines, so the trace reads as an audit trail of *why* the run went the way
it did, not just what ran.

---

## 8. Known gaps (say these out loud, don't hide them — they read as self-awareness, not weakness)

- **No LLM-call budget enforcement.** `RUN_MAX_LLM_CALLS` is declared as "the money guard" but
  never actually checked anywhere yet.
- **No SSE reconnect.** A dropped stream currently ends the run from the user's perspective.
- **Stop/cancel isn't wired up.** The button exists in the UI, disabled, with an honest tooltip.
- **Memory/RAG layer is a stub.** `fetchContext()` is an empty function; cross-project semantic
  memory (`User.semanticMem`) has a column but no writer.
- **Mid-run replanning doesn't exist.** `decideNextStep` after each DAG level always returns
  `continue` — the hook is there, the actual "should I change the plan" logic isn't.
- **Deploy isn't in the automatic pipeline.** `CallAgent.Deploy()` calls the Vercel MCP but isn't
  invoked from the live `Execute()` path yet, and has an explicit TODO for failure handling.
- **`researcher` and `tester` subagents are effectively dead planner assignments** — the planner
  is type-constrained to only ever assign `coder`/`uiExpert`; research got inlined as an action
  *inside* coder/debugger instead of being its own spawned agent.

---

## 9. How to frame this in an interview

If asked "walk me through something hard you built," the highest-signal threads in this repo:

1. **The worktree-isolation-instead-of-locking design** — a real distributed-systems tradeoff
   (isolation vs. merge cost) made deliberately, with an LLM in the loop for the one place it
   pays off (semantic merge conflict resolution) and a hard stop for the cases it shouldn't
   guess at (binary/delete conflicts).
2. **Two-phase planning with a concurrency trick** (hiding the cheap LLM call under the slow
   external API call) — shows you think about latency budgets, not just correctness.
3. **The prompt-structure doc** (Structure A/B, soft budgets, safety-net-not-danger framing) —
   evidence of *systematic* prompt engineering, not trial-and-error; you can point to a specific
   prompt (`CODER_PROMPT`) and explain why each section exists.
4. **The strangler-fig REST→GraphQL migration**, done live under a running product, that also
   fixed a real authz hole along the way — shows you can migrate a system without a big-bang
   rewrite.
5. **The honest gaps list** — being able to say "here's what I deliberately deferred and why"
   (e.g., mid-run replanning, LLM budget enforcement) reads far better than pretending everything
   is finished.
