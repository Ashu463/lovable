# UI Expert as a full agent — design spec

Date: 2026-08-22
Status: approved, moving to implementation

## Why

Today "UI Expert" is a single-shot LLM call (`craftDesignVariants`) that
frames a Stitch prompt and fetches HTML back. It never touches the sandbox,
never writes code, and every request — simple or complex — goes through the
same unconditional upfront "generate 3 screens, pick one" gate in
`callAgent.ts`, before complexity is even judged.

This produces two concrete problems:

1. Complex, multi-screen builds get one shared design decision made once,
   upfront, with no way to make a further UI-defining decision per screen as
   the plan unfolds.
2. Every UI todo starts from an empty starter (`src/App.tsx` boilerplate) with
   nothing but a bare design reference (`figmaBoilerPlate`, now fixed to
   actually carry the selected design HTML — see prior session). Coder has to
   both translate the design *and* wire it into the app *and* implement
   behavior, every single time, from scratch.

This spec makes UIExpert a real second tool-loop agent (alongside Coder),
responsible for translating a design into working base-template code, so
downstream Coder todos build on real scaffolding instead of starting cold.

## Scope

In scope: pipeline ordering (complexity before design gen), UIExpert's new
tool-loop phase (deciding mood/palette itself, no clarifying question for
it), the shared `ui-base-template` skill, sandbox `/design` storage + R2
sync, and the
planner prompt rewrite that makes UIExpert plannable again.

Out of scope (explicitly deferred, not part of this change): worktree
isolation, the context engine, the replan-decision LLM call, and the
frontend design-selection-not-visible bug — all separately tracked.

## Current state (for reference)

- `callAgent.ts` generates 3 design variants unconditionally before branching
  on complexity, saves them to Postgres (`Design` table, `htmlContent` +
  `prompt`), and returns them for the user to pick from.
- `COMPLEXITY_CHECKER_AND_QUESTION_GENERATOR_PROMPT` already runs on every
  message, already treats complexity and clarification as independent
  judgments, and already supports asking questions on simple requests.
- `PLAN_TASK_SYSTEM_PROMPT` explicitly states "Coder is the only executor
  you're planning for" — UIExpert is not a plannable delegate today.
- `UIExpert` (`subagents/uiExpert.ts`) holds a sandbox reference in its
  constructor but never writes to it — `craftDesignVariants` /
  `generateDesigns` / `fetchDesigns` only call Stitch and fetch HTML over
  HTTP.
- `uiExpert.baml` has an empty, uncalled stub: `function UIExpertAgent() ->
  string{}` — a placeholder never filled in.
- `CODER_PROMPT` embeds a "HOW TO BUILD UI" procedure (translate design →
  write component → wire into App.tsx → build/verify) directly in its system
  prompt — not factored out as a skill.
- `skills/index.ts` has a `# FIX` comment flagging that `uiExpert`'s
  `DESIGN_SYSTEM` skill override (`design-ui`) is temporary, to be revisited
  when UIExpert is properly rebuilt.
- `E2BSandbox.resolvePath` resolves every relative path against
  `PROJECT_ROOT`, so writing to `design/foo.html` already lands at
  `${PROJECT_ROOT}/design/foo.html` with zero new sandbox code.
- `SyncR2()` walks all of `PROJECT_ROOT` and already fires after
  coder/debugger turns in every path (`agent.ts`, `orchestrator.ts`,
  `callAgent.ts`) — a file written under `/design` is synced for free.

## Design

### 1. Pipeline reorder

`callAgent.ts` currently generates designs before branching on complexity.
This moves: complexity/clarification runs first (as it already structurally
does — `COMPLEXITY_CHECKER_AND_QUESTION_GENERATOR_PROMPT` is the first real
gate), and design generation becomes conditional on the verdict:

- **Simple** → today's unconditional 3-screen picker, unchanged in shape.
  Selected design still saves to Postgres via `saveDesigns` as it does now,
  *and* additionally gets written to the sandbox at `design/main-<n>.html`
  for the one selected variant (not the two discarded ones), synced via the
  existing `SyncR2()` call already present in `callAgent.ts`.
- **Complex** → skips the upfront picker entirely. The planner instead emits
  UIExpert todos per screen, each producing its own design + base template
  mid-DAG.

### 2. No mood/palette clarifying questions — that's the point of this change

Corrected mid-implementation: mood/palette is explicitly NOT a clarifying
question on either path. The whole reason the complex path gets a UIExpert
subagent per screen instead of routing through the upfront 3-screen picker
is to *save* the time that picker costs (~80s generation + a user round
trip) — asking a mood/palette question first would reintroduce exactly that
round trip, just with fewer options. Simple path keeps generating 3 screens
and letting the user pick (unchanged, that's still its mechanism for
expressing visual preference). Complex path's UIExpert decides mood/palette
autonomously per screen as part of its own Phase A framing call — no
user-facing question, no new BAML field for it.

General clarification (unrelated to mood/palette, e.g. data-model or scope
ambiguity) is a separate concern from complexity, and should eventually be
its own independent LLM call rather than bundled into
`CheckComplexityAndGenerateQuestions` as it is today — flagged as follow-up
work, out of scope for this spec.

### 3. UIExpert becomes a two-phase agent

**Phase A — design framing (existing, reused):** `craftDesignVariants` frames
a Stitch prompt from the task spec + skills, calls Stitch, fetches HTML back.
Unchanged mechanically from today's `FramePrompts` call — mood/palette is
left to the model's own judgment within that same call, not sourced from a
separate answer.

**Phase B — base template (new):** a Coder-shaped tool loop that takes the
Phase A HTML and translates it into the initial `.tsx` + wires it into
`App.tsx`/routing, and stops there — no business logic, no state wiring
beyond what the design implies structurally. This fills in the empty
`UIExpertAgent` BAML stub (`uiExpert.baml:63`), reusing the exact same tool
union Coder already has (`WriteFile | EditFile | ReadFile | RunCommand |
DeleteFile | FetchDocs | Research | GetSkill | Done | Abort`) rather than a
parallel schema. `UIExpert` gains an `executeFunction`/tool-loop path
matching `CoderAgent`'s shape (reuses `BaseAgent`'s loop machinery already
used by Coder/Debugger).

Scope boundary for Phase B, stated explicitly in its prompt: translate and
wire, verify it builds, stop. A follow-up Coder todo (already dependency-
ordered after the UIExpert todo in the DAG) handles behavior/state/handlers.
This is a narrower slice of what Coder's "HOW TO BUILD UI" section covers
today — Coder keeps doing full UI-with-behavior for the simple path and for
any complex-path UI todo that doesn't go through UIExpert.

### 4. Shared skill: `ui-base-template`

Extract the "HOW TO BUILD UI" section (translate → write component → wire
into App.tsx → build/verify → recovering from a broken file) out of
`CODER_PROMPT` into `skills/ui-base-template/SKILL.md`. Attach it to both
`coder` and `uiExpert` in `ROLE_SKILLS` (always-loaded in full, not the
lazy `getSkill()` path — this is core procedure for both, not optional
domain knowledge). `CODER_PROMPT` shrinks to reference the skill instead of
inlining the procedure.

This also resolves the `# FIX` breadcrumb in `skills/index.ts:73` about
`uiExpert`'s temporary `design-ui` skill override — that override stays (it's
about `DESIGN_SYSTEM` content, orthogonal to this), but the file now has a
real, non-provisional `uiExpert`-relevant skill set instead of a stopgap.

### 5. Storage layout

`design/<taskId>-<screenName>.html` in the sandbox for complex-path per-todo
screens. `screenName` is a short slug derived from the todo's task text
(lowercased, hyphenated, truncated). Synced automatically — no new sync
code, `SyncR2()` already runs after every coder/debugger/UIExpert turn.

No Postgres row for complex-path per-todo screens — the `Design` table exists
to back the selection picker UI, and there's no picker mid-DAG. If a future
need arises to list/inspect these mid-build, the sandbox files + R2 are the
source of truth, not a new DB table.

### 6. Planner rewrite

`PLAN_TASK_SYSTEM_PROMPT`'s current line — "Coder is the only executor
you're planning for" — is replaced. New guidance: emit a UIExpert todo for
any task introducing a new UI surface (a screen/page not already covered by
an existing design in this run's context); emit the corresponding Coder
todo(s) for behavior with a `dependency` on that UIExpert todo's id, using
the DAG dependency mechanism already in place. Non-UI todos (API routes,
data layer, config) continue to route to Coder exactly as today.

`buildSubAgentInput`'s existing `uiExpert` case in `orchestrator.ts`
(`{screenId, mode, referenceScreenIds}`) already has the right shape for
this — no new SubAgentTodo data needed.

## Error handling

- Phase A failure (Stitch/framing) → same as today: `generateDesigns`
  already handles partial variant failure via `Promise.allSettled` and
  throws only if all fail. A UIExpert todo with a fully-failed Phase A fails
  the todo, surfaces to the merge gate like any other subagent failure.
- Phase B failure (translation/wiring) → same failure shape as a Coder todo
  failing: `Abort` with a reason, or a build that doesn't pass — caught by
  the existing merge-gate tester/debugger loop, since a broken UIExpert
  scaffold is just as build-breaking as a broken Coder edit and needs the
  same recovery path, not a special case.

## Testing

Per project convention, testing is being done by the user directly this
week — this spec doesn't add a new automated test suite. Verification is:
does a complex run with a UI todo produce a `/design` file, a working
scaffolded `.tsx` wired into `App.tsx`, and does the following Coder todo
build on it instead of starting from the stock starter.

## Open items carried forward (not blocking this spec)

- Exact slug derivation for `screenName` — implementation detail, not a
  design fork.
- ~~Decoupling general clarification from the complexity verdict~~ — done.
  `CheckComplexityAndGenerateQuestions` split into independent
  `CheckComplexity` and `GenerateClarifyingQuestions` (`qna.baml`), with
  matching `COMPLEXITY_CHECKER_PROMPT` / `CLARIFICATION_PROMPT` split in
  `systemPrompts.ts` and `callAgent.ts`'s `Bootstrap()` restructured to run
  both independently. `CLARIFICATION_PROMPT` also now covers "what is this
  person actually trying to build" ambiguity (including UI mood/direction)
  as one eligible question category — explicitly not gated to UI requests,
  not mandatory, and never asked per-screen inside an already-planned
  complex build (that's UIExpert's own call at build time).
