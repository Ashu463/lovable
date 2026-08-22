# UI Expert Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `UIExpert` from a single-shot Stitch-prompt-framer into a real two-phase tool-loop agent that generates a per-screen design and writes its base-template implementation into the sandbox, and reorder the pipeline so complexity is judged before design generation.

**Architecture:** `UIExpert` gains a Phase A (frame a Stitch prompt from the task + run's clarified context, generate HTML, save to `design/<taskId>-<slug>.html` in the sandbox) run once and cached, followed by a Phase B tool loop — mechanically identical to `CoderAgent`'s (`WriteFile`/`EditFile`/`ReadFile`/`RunCommand`/`DeleteFile`/`Done`/`Abort`) — that translates the Phase A HTML into the initial `.tsx` and wires it into `App.tsx`. `SubAgent`'s generic dispatch stops treating `uiExpert` as single-shot and reuses the same context shape (`CoderContext`) it already builds for `coder`. The planner becomes able to emit `uiExpert` todos again, with `coder` todos depending on them for behavior. Design generation in `callAgent.ts` moves from unconditional-upfront to conditional-on-simple-verdict.

**Tech Stack:** TypeScript, Bun, BAML (`@boundaryml/baml`), Prisma/Postgres (unchanged in this plan), E2B sandbox.

**Spec:** `22_aug.planner.md` (repo root) — read it alongside this plan; this plan implements it task by task and assumes its rationale.

## Global Constraints

- Per project CLAUDE.md ("Testing: do this only when I explicitly say about testing, else neglect it"), this plan does not add a TDD suite around LLM-prompt behavior or sandbox-integration flows — those aren't meaningfully unit-testable and the project's actual testing culture is live/manual runs (see `packages/agents/CLAUDE.md`'s "Task for today"). Verification per task is: it typechecks, it builds, and — for the one genuinely pure/isolable unit (the slug/path helper) — a real `bun:test`, matching the existing `skills.test.ts` convention (no network, no LLM, no sandbox).
- Follow existing patterns: BAML functions live in `baml_src/*.baml`, get regenerated into `baml_client/` via `bun run baml-generate` (must be run after every `.baml` edit, from `packages/agents/`).
- Don't touch `apps/backend` or `apps/frontend` in this plan — everything here is `packages/agents`, per the spec's stated scope (no DB schema change, no picker UI change needed for this feature).
- Never edit generated files by hand: `baml_client/*` is regenerated, not hand-edited.
- Conventional commits scoped to `agents:` per repo convention.

---

## Task 1: Extract shared `ui-base-template` skill, wire into both `coder` and `uiExpert`

**Files:**
- Create: `packages/agents/agent/skills/ui-base-template/SKILL.md`
- Modify: `packages/agents/agent/skills/index.ts`
- Modify: `packages/agents/agent/config/systemPrompts.ts:432-473` (CODER_PROMPT's "HOW TO BUILD UI" + "RECOVERING FROM A BROKEN FILE" sections)

**Interfaces:**
- Produces: `SkillStore.getRoleSkills('coder')` and `SkillStore.getRoleSkills('uiExpert')` both include a skill named `ui-base-template`.

- [ ] **Step 1: Create the skill file**, moving the exact content currently inlined in `CODER_PROMPT`'s "HOW TO BUILD UI" and "RECOVERING FROM A BROKEN FILE" sections (`systemPrompts.ts:432-473`):

```markdown
---
name: ui-base-template
description: How to translate a design reference (HTML mockup) into working component code and wire it into the app. Used by both CoderAgent (full UI-with-behavior work) and UIExpertAgent (base-template-only scaffolding).
---

# Translating a Design Into Code

The sandbox is a Vite + React + TypeScript project, already installed and
building. It starts as a stock starter: src/App.tsx renders the boilerplate
"Get started" / "Count is 0" screen, there is no router, and there is no
src/pages directory.

Two consequences that decide whether your work is visible at all:

- The preview renders src/App.tsx and only what App.tsx imports. A component
  file nothing imports does not appear, however correct it is.
- Files are .tsx, so their contents must be TypeScript + JSX. A page written
  as an HTML document does not compile.

## How to build UI

Follow this order. Most failures come from skipping step 1 or step 3.

1. **Translate the design before writing it.** If you were given a design
   reference, it arrives as an HTML mockup. It is a specification of layout
   and visual structure, not file content. Convert it as you write: class
   becomes className, every tag closes, style blocks and script tags and
   DOCTYPE/html/head/body wrappers are dropped, and inline handlers become
   React handlers. Never paste an HTML document into a .tsx file.

   When a design reference is present, it is the design already picked or
   generated for this screen — not a suggestion. Match its layout, spacing,
   colors, and component structure; don't substitute your own visual
   judgment for it.

2. **Write the component.** A .tsx file holds imports, one component, and an
   export — nothing above the imports, nothing below the export.

3. **Wire it into src/App.tsx in the same item.** Import it and render it.
   If the item needs more than one route, install a router, set it up in
   App.tsx, and register the route. Replace the starter content while you are
   there; it is scaffolding, not something to preserve alongside your work.
   "Match existing conventions" applies to real code, not to this starter.

4. **Build, and read the errors.** Fix what they point at, then build again.

## Recovering from a broken file

When a build error names a file you just wrote, decide which situation you
are in before editing:

- **The file's overall shape is wrong** — it still contains HTML document
  markup, or leftover content sits above the imports or below the export, or
  the same markup appears twice. Use WriteFile to replace the whole file with
  correct content. Do not patch it with EditFile: a single edit replaces one
  substring and leaves the rest of the wrong content in place, which is how a
  file ends up holding a valid component followed by the HTML it was supposed
  to replace.

- **The file is structurally sound and a specific line is wrong.** Use
  EditFile on that line.

If an EditFile fails with "oldString not found" or "matched N times", your
picture of the file is stale — ReadFile before trying again. If two edits in
a row fail on the same file, stop editing and rewrite it with WriteFile.
Repeating a failing edit with slightly different whitespace never works.
```

- [ ] **Step 2: Register the skill in `skills/index.ts`.** Add a new id, file mapping, name mapping, and add it to `ROLE_SKILLS` for both `coder` and `uiExpert`:

```ts
const skillsMapper = {
    PROJECT_CONVENTION: 0,
    DESIGN_SYSTEM: 1,
    DEPENDENCY_POLICY: 2,
    TRIAGE_PROTOCOL: 3,
    DERIVE_ACCEPTANCE_CRITERIA: 4,
    SMOKE_CHECKLIST: 5,
    RESPONSIVE_RULES: 6,
    REPORT_FORMAT: 7,
    SOURCE_QUALITY_RUBRIC: 8,
    SCAFFOLD_NEW_PROJECT: 9,
    ADD_A_ROUTE: 10,
    DATABASE_INTEGRATION: 11,
    API_ROUTE_CONVENTIONS: 12,
    STATE_MANAGEMENT_RULES: 13,
    FORM_HANDLING: 14,
    LAYOUT_PATTERNS: 15,
    ASSET_POLICY: 16,
    VISUAL_VERIFICATION: 17,
    UI_BASE_TEMPLATE: 18,
} as const;
```

Add to `skillFiles`: `[skillsMapper.UI_BASE_TEMPLATE]: "ui-base-template",`
Add to `skillNames`: `[skillsMapper.UI_BASE_TEMPLATE]: "ui-base-template",`

Update `ROLE_SKILLS`:

```ts
const ROLE_SKILLS: Record<AgentKey, SkillId[]> = {
    coder: [skillsMapper.DESIGN_SYSTEM, skillsMapper.DEPENDENCY_POLICY, skillsMapper.ADD_A_ROUTE, skillsMapper.UI_BASE_TEMPLATE],
    debuggerr: [skillsMapper.TRIAGE_PROTOCOL],
    tester: [skillsMapper.DERIVE_ACCEPTANCE_CRITERIA, skillsMapper.SMOKE_CHECKLIST],
    researcher: [skillsMapper.REPORT_FORMAT, skillsMapper.SOURCE_QUALITY_RUBRIC],
    uiExpert: [skillsMapper.DESIGN_SYSTEM, skillsMapper.RESPONSIVE_RULES, skillsMapper.UI_BASE_TEMPLATE],

    agent: [skillsMapper.DESIGN_SYSTEM, skillsMapper.DEPENDENCY_POLICY],
};
```

- [ ] **Step 3: Shrink `CODER_PROMPT`** — replace the inlined "HOW TO BUILD UI" and "RECOVERING FROM A BROKEN FILE" sections (`systemPrompts.ts:432-473`) with a short pointer, since the skill is now always-loaded for `coder` via `ROLE_SKILLS`:

```ts
# HOW TO BUILD UI

Full procedure is in your ui-base-template skill (always loaded in your
context) — translate the design, write the component, wire it into
src/App.tsx, build and read errors, and how to recover from a broken file.
Follow it exactly; it is not optional guidance.
```

- [ ] **Step 4: Run the existing skill contract test** to confirm the new skill file parses and both roles pick it up:

Run: `bun test packages/agents/agent/skills/skills.test.ts`
Expected: PASS (it iterates whatever `getRoleSkills('coder')` returns, so the new skill is covered automatically — no test file change needed unless you want an explicit assertion; if so, add one line checking `skills.some(s => s.name === 'ui-base-template')` for both `coder` and `uiExpert` in a new `test(...)` block in that file).

- [ ] **Step 5: Commit**

```bash
git add packages/agents/agent/skills/ui-base-template packages/agents/agent/skills/index.ts packages/agents/agent/config/systemPrompts.ts packages/agents/agent/skills/skills.test.ts
git commit -m "agents: extract ui-base-template skill shared by coder and uiExpert"
```

---

## Task 2: BAML — implement `UIExpertAgent`, extend `UIExpertContext`

**Files:**
- Modify: `packages/agents/baml_src/uiExpert.baml`

**Interfaces:**
- Consumes: `CoderContext` (already defined in `coderAgent.baml`), `WriteFile | ReadFile | EditFile | RunCommand | DeleteFile | Done | Abort` (already defined in `agents.baml`).
- Produces: `b.UIExpertAgent(systemPrompt: string, htmlDesign: string | null, context: CoderContext) -> WriteFile | ReadFile | EditFile | RunCommand | DeleteFile | Done | Abort`, usable from `baml_client` after regeneration.

- [ ] **Step 1: Replace the empty `UIExpertAgent` stub** (currently `function UIExpertAgent() -> string{}` at the bottom of `uiExpert.baml`) with a real function mirroring `CoderAgent`'s shape but with a trimmed tool union — no `Research`/`FetchDocs`/`GetSkill`, since Phase B's scope is bounded translation work, not investigation:

```baml
function UIExpertAgent(
    systemPrompt: string,
    htmlDesign: string?,
    context: CoderContext,
) -> WriteFile | ReadFile | EditFile | RunCommand | DeleteFile | Done | Abort
{
    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        Whatever else {{context}} carries about the current codebase state.

        {% if htmlDesign %}{{ htmlDesign }} - the Stitch-generated design for
  this screen. Translate it into the base template; do not add business
  logic or state beyond what the layout structurally implies.{% endif %}

        {{ctx.output_format}}
    "#
}

test UIExpertAgentTest {
  functions [UIExpertAgent]
  args {
    systemPrompt #"
      You are the UIExpert base-template agent.
    "#
    htmlDesign "<div class=\"p-4\"><h1>Dashboard</h1></div>"
    context {
        task "Build the dashboard screen base template"
        dependentSummary []
        repoTree #"
        src/App.tsx
        "#
        skills []
        recentTurns []
    }
  }
}
```

- [x] **Step 2 (revised, superseded): `UIExpertContext` stays unchanged.** Corrected mid-implementation — mood/palette is not a clarifying question on either path (see spec `22_aug.planner.md` §2, revised); UIExpert decides mood/palette itself within its existing `FramePrompts` call, so no new field is needed. `UIExpertContext` ends up unused in the TS layer entirely after Task 7 (`craftDesignVariants` calls `b.FramePrompts` directly, never constructing a `UIExpertContext` value) — it stays defined only for the `AgentContext`/`SubAgentsContext` unions in `agents.baml`, out of scope for this plan to touch.

- [ ] **Step 3: Regenerate the BAML client**

Run: `cd packages/agents && bun run baml-generate`
Expected: completes without errors, `baml_client/types.ts` now exports a `UIExpertAgent` function signature matching Step 1.

- [ ] **Step 4: Typecheck**

Run: `cd packages/agents && bunx tsc --noEmit -p .`
Expected: no new errors (pre-existing `edit.test.ts` errors are unrelated and already present before this plan).

- [ ] **Step 5: Commit**

```bash
git add packages/agents/baml_src/uiExpert.baml packages/agents/baml_client
git commit -m "agents: implement UIExpertAgent BAML function, extend UIExpertContext"
```

---

## Task 3: System prompts — `UI_EXPERT_BASE_TEMPLATE_PROMPT`, planner rewrite

**Files:**
- Modify: `packages/agents/agent/config/systemPrompts.ts`

**Interfaces:**
- Produces: `UI_EXPERT_BASE_TEMPLATE_PROMPT` (new export, string) — consumed by Task 7's `UIExpert.callLLM`.

- [ ] **Step 1: Add `UI_EXPERT_BASE_TEMPLATE_PROMPT`**, right after `CODER_PROMPT`'s export block:

```ts
// ============================================================================
// 5b. UI_EXPERT_BASE_TEMPLATE_PROMPT
//    function UIExpertAgent(systemPrompt, htmlDesign?, context: CoderContext)
//      -> WriteFile | ReadFile | EditFile | RunCommand | DeleteFile | Done | Abort
//    Phase B of UIExpert: translate the Phase A Stitch design into the base
//    template and stop — behavior/state is the following Coder todo's job.
// ============================================================================

export const UI_EXPERT_BASE_TEMPLATE_PROMPT = `
# ROLE

You are UIExpert, implementing the base-template phase of a UI screen. A
design has already been generated for you (see the design reference in your
context). Your scope is narrower than CoderAgent's: translate that design
into working component code and wire it into the app, then stop. You do not
add business logic, state management, or event handlers beyond what the
layout structurally requires (e.g. a nav needs a route, not a form needs
validation).

Follow the procedure in your ui-base-template skill (always loaded in your
context) exactly.

# CHOOSING AN ACTION

Same actions as CoderAgent, minus research/docs lookup — this phase doesn't
need them: ReadFile, EditFile, WriteFile, DeleteFile, RunCommand, Done,
Abort. Use RunCommand to verify the build before Done, same as CoderAgent.

# CONSTRAINTS

- Never fabricate the contents of a file you haven't actually read via
  ReadFile in this session.
- Never emit Done while the build is failing.
- Stop at working scaffold. If you notice the screen needs real behavior
  (a form that should submit, a list that should filter), that is out of
  scope here — a following item handles it. Don't build it now.
- Never write a full HTML document into a .tsx file.

# OUTPUT

One action per turn. The action names above are field values in your
response, not callable tools — never emit tool-call or function-call markup,
it cannot be parsed and wastes the turn.
`;
```

- [ ] **Step 2: Rewrite the "Coder is the only executor" line in `PLAN_TASK_SYSTEM_PROMPT`.** Current text (around `systemPrompts.ts:320-324`):

```
Coder is the only executor you're planning for. Debugger is invoked
automatically and reactively if an item's verification fails — you don't
plan for it. Research and documentation lookup are tools Coder reaches for
itself mid-item — you don't plan separate research steps, though you may
flag an item as research-heavy as a hint.
```

Replace with:

```
Coder and UIExpert are the executors you're planning for. Emit a UIExpert
item for any item that introduces a new UI surface — a screen or page not
already covered by an existing design in this run. Emit the corresponding
Coder item(s) for that screen's behavior with a dependency on the UIExpert
item's id, so it runs after the base template exists. Non-UI items (API
routes, data layer, config, business logic on an existing screen) go to
Coder directly, exactly as before. Debugger is invoked automatically and
reactively if an item's verification fails — you don't plan for it. Research
and documentation lookup are tools Coder reaches for itself mid-item — you
don't plan separate research steps, though you may flag an item as
research-heavy as a hint.
```

- [x] **Step 3 (revised, superseded): no mood/palette question guidance added.** Corrected mid-implementation — mood/palette is not a clarifying question at all (see spec `22_aug.planner.md` §2, revised). UIExpert decides it autonomously within Phase A. `COMPLEXITY_CHECKER_AND_QUESTION_GENERATOR_PROMPT` is left untouched by this plan.

- [ ] **Step 4: Typecheck**

Run: `cd packages/agents && bunx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 5: Commit** — skipped per standing instruction: this user commits their own changes, never run git commit on their behalf. Leave changes staged/unstaged for review.

---

## Task 4: `subAgentsTypes.ts` — reuse `CoderContext` for UIExpert, clean up `UIExpertTaskInput`

**Files:**
- Modify: `packages/agents/types/subAgentsTypes.ts`

**Interfaces:**
- Consumes: `CoderContext` from `baml_client` (already imported).
- Produces: `InputMap['uiExpert']` gains `updatedPrompt: string`, drops the unused `query` field. `ContextMap['uiExpert']` becomes `CoderContext`.

- [ ] **Step 1: Update `UIExpertTaskInput`** (currently `BaseTaskInput & { query: string }` at line 38-40, flagged in its own comment as needing refactor):

```ts
export type UIExpertTaskInput = BaseTaskInput & {
    updatedPrompt: string
}
```

- [ ] **Step 2: Update `ContextMap`** (line 50-56) to bind `uiExpert` to `CoderContext` instead of `UIExpertContext`:

```ts
export type ContextMap = {
    coder: CoderContext,
    debuggerr: DebuggerContext,
    tester: TesterContext,
    researcher: ResearcherContext,
    uiExpert: CoderContext
}
```

- [ ] **Step 3: Remove the now-unused `UIExpertContext` import** from the top-of-file import list (line 6) — it's no longer referenced anywhere in this file.

- [ ] **Step 4: Typecheck** — this will surface every call site that still assumes the old shapes (expected; Tasks 5, 7, 8 fix them):

Run: `cd packages/agents && bunx tsc --noEmit -p .`
Expected: new errors in `subAgent.ts` (BuildUIExpertContext return type mismatch) and `orchestrator.ts` (buildSubAgentInput uiExpert case). This is expected — do not fix them here, Tasks 5 and 8 do.

- [ ] **Step 5: Commit**

```bash
git add packages/agents/types/subAgentsTypes.ts
git commit -m "agents: reuse CoderContext for UIExpert's tool-loop context, clean up UIExpertTaskInput"
```

---

## Task 5: `subAgent.ts` — extract shared context builder, stop treating UIExpert as single-shot

**Files:**
- Modify: `packages/agents/agent/subAgent.ts`

**Interfaces:**
- Consumes: `SkillStore.getRoleSkills`/`getTaskCatalog` (existing), `E2BSandbox.getRepoTree` (existing).
- Produces: `SubAgent.BuildUIExpertContext(): Promise<CoderContext>` (replacing the old one that returned `UIExpertContext`).

- [ ] **Step 1: Extract a shared helper** that both `BuildCoderContext` and the new `BuildUIExpertContext` call, since they're now structurally identical except for which role's skills they load. Replace the existing `BuildCoderContext` method (around line ~185-200) with:

```ts
private async buildToolLoopContext(role: 'coder' | 'uiExpert'): Promise<CoderContext> {
    const dependentTaskIds = (this.input as BaseTaskInput).task.dependentTasks
    if(this.repoTree === ""){
        this.repoTree = await this.sandbox.getRepoTree()
    }
    const res = await backendGql<{summaries: {summary: string, todo: {taskId: number}}[]}>(
        `query Summaries($projectId: ID!, $runId: ID!) {
            summaries(projectId: $projectId, runId: $runId) { summary todo { taskId } }
        }`,
        { projectId: this.projectId, runId: this.runId }
    )
    const summaries: TaskSummary[] = res.summaries
        .filter(s => dependentTaskIds.includes(s.todo.taskId))
        .map(s => ({ taskId: String(s.todo.taskId), summary: s.summary }))

    const skills = [
        ...(await this.skillStore.globalSkills(role)),
        ...(await this.skillStore.getRoleSkills(role)),
        ...(await this.skillStore.getTaskCatalog(role)),
    ]
    return { task: (this.input as BaseTaskInput).task.task, dependentSummary: summaries, repoTree: this.repoTree, skills: skills, recentTurns: [] }
}

async BuildCoderContext(): Promise<CoderContext>{
    logger.info(`Building context for coder`)
    return this.buildToolLoopContext('coder')
}

async BuildUIExpertContext(): Promise<CoderContext>{
    logger.info(`Building context for uiExpert`)
    return this.buildToolLoopContext('uiExpert')
}
```

Delete the old `BuildUIExpertContext` method (the one building `UIExpertContext` with `priorDesigns` from the `designs` GraphQL query and the `#TODO` comment about the shape mismatch) — it's replaced by the version above. That GraphQL `designs` query and its shape-mismatch problem go away entirely, since Phase A (Task 7) generates its own design fresh per todo rather than reading `priorDesigns` from Postgres.

- [ ] **Step 2: Update `BuildInitialContext`'s switch** (around line ~178-188) — no change needed to the switch statement itself, since `case 'uiExpert': return await this.BuildUIExpertContext() as ContextMap[T]` already calls the right method name; it now just returns the new type.

- [ ] **Step 3: Remove `'uiExpert'` from `isSingleShotAgent()`** (around line ~68-70):

```ts
private isSingleShotAgent(): boolean {
    return this.agentType === 'tester' || this.agentType === 'researcher'
}
```

- [ ] **Step 4: Typecheck**

Run: `cd packages/agents && bunx tsc --noEmit -p .`
Expected: the `subAgent.ts`-side errors from Task 4 are now gone. Remaining errors should only be in `orchestrator.ts` (fixed in Task 8) and `uiExpert.ts` (fixed in Task 7) and the pre-existing unrelated `edit.test.ts` ones.

- [ ] **Step 5: Commit**

```bash
git add packages/agents/agent/subAgent.ts
git commit -m "agents: give UIExpert a real multi-turn loop with coder's context shape"
```

---

## Task 6: Bump `UI_EXPERT_MAX_ITERATIONS`, fix stale comment

**Files:**
- Modify: `packages/agents/agent/config/systemConfig.ts`

- [ ] **Step 1: Update the constant and its comment.** Current:

```ts
// Researcher/tester/uiExpert are single-shot (see SubAgent.isSingleShotAgent), so
// their loop breaks on the first pass and these caps never actually bind.
export const RESEARCHER_MAX_ITERATIONS = 1
export const TESTER_MAX_ITERATIONS = 1
export const UI_EXPERT_MAX_ITERATIONS = 1
```

Replace with:

```ts
// Researcher/tester are single-shot (see SubAgent.isSingleShotAgent), so their
// loop breaks on the first pass and these caps never actually bind.
export const RESEARCHER_MAX_ITERATIONS = 1
export const TESTER_MAX_ITERATIONS = 1
// UIExpert runs a real tool loop (translate design -> write component -> wire
// into App.tsx -> verify build) but its scope is narrower than Coder's, so it
// gets a smaller cap.
export const UI_EXPERT_MAX_ITERATIONS = 8
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/agents && bunx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add packages/agents/agent/config/systemConfig.ts
git commit -m "agents: give UIExpert a real iteration cap now that it's a tool loop"
```

---

## Task 7: `uiExpert.ts` — Phase A (design + save to sandbox) and Phase B (base-template tool loop)

**Files:**
- Modify: `packages/agents/agent/subagents/uiExpert.ts`
- Create: `packages/agents/agent/utils/designPath.ts`
- Create: `packages/agents/agent/utils/designPath.test.ts`

**Interfaces:**
- Consumes: `UI_EXPERT_BASE_TEMPLATE_PROMPT` (Task 3), `b.UIExpertAgent` (Task 2), `makeOneScreen` (existing, `tools/stitch.ts`), `UIExpertTaskInput`/`CoderContext` (Task 4).
- Produces: `designFilePath(taskId: number, screenName: string): string`, `slugify(text: string, maxLen?: number): string` — pure, used by Task 7 and testable standalone.

- [ ] **Step 1: Write the failing test for the path helper**

```ts
// packages/agents/agent/utils/designPath.test.ts
import { test, expect } from "bun:test";
import { slugify, designFilePath } from "./designPath";

test("slugify lowercases, hyphenates, and strips non-alphanumerics", () => {
    expect(slugify("Build the Dashboard Screen!")).toBe("build-the-dashboard-screen");
});

test("slugify truncates to maxLen and trims trailing hyphens", () => {
    expect(slugify("a very very very long screen name indeed", 10)).toBe("a-very-ver");
});

test("slugify falls back to 'screen' for input with no alphanumerics", () => {
    expect(slugify("!!!")).toBe("screen");
});

test("designFilePath builds the sandbox-relative design path", () => {
    expect(designFilePath(12, "Dashboard")).toBe("design/12-dashboard.html");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test packages/agents/agent/utils/designPath.test.ts`
Expected: FAIL — `./designPath` doesn't exist yet.

- [ ] **Step 3: Implement the helper**

```ts
// packages/agents/agent/utils/designPath.ts
export function slugify(text: string, maxLen = 40): string {
    const slug = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, maxLen)
        .replace(/-+$/g, "");
    return slug || "screen";
}

export function designFilePath(taskId: number, screenName: string): string {
    return `design/${taskId}-${slugify(screenName)}.html`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun test packages/agents/agent/utils/designPath.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Rewrite `uiExpert.ts`** with Phase A + Phase B. Full replacement:

```ts
import type { Screen } from "@google/stitch-sdk"
import { makeOneScreen } from "../tools/stitch"
import { BaseAgent } from "./baseAgent"
import { b, type CoderContext, type Skill, type WriteFile, type ReadFile, type EditFile, type RunCommand, type DeleteFile, type Done, type Abort } from "../../baml_client"
import { UI_VARIANTS_PROMPT, UI_EXPERT_BASE_TEMPLATE_PROMPT } from "../config/systemPrompts"
import type { E2BSandbox } from "../utils/sandbox"
import type { UIExpertTaskInput } from "../../types/subAgentsTypes"
import { designFilePath } from "../utils/designPath"
import { logger } from "../utils/logger"

type UIExpertLLMResponse = WriteFile | ReadFile | EditFile | RunCommand | DeleteFile | Done | Abort
type UIExpertAgentResponse = {
    success: boolean,
    response: string,
}

export class UIExpert extends BaseAgent<UIExpertTaskInput, CoderContext, UIExpertLLMResponse, UIExpertAgentResponse>{

    // Phase A runs once, on the first callLLM, and caches its result for the
    // rest of the tool loop — Phase A produces the design, Phase B (every
    // call after) translates it, so there's no reason to re-run Phase A per
    // iteration.
    private htmlDesign: string | null = null

    constructor(
        userId: string,
        projectId: string,
        sandbox: E2BSandbox,
    ){super(userId, projectId, sandbox)}

    private async runPhaseA(input: UIExpertTaskInput, skills: Skill[]): Promise<string> {
        const userPrompt = `${input.task.task}\n\n${input.updatedPrompt}`
        const framed = await b.FramePrompts(UI_VARIANTS_PROMPT, userPrompt, "", skills)
        const prompt = framed.prompts[0]
        if (!prompt) {
            throw new Error(`FramePrompts returned no prompts for task ${input.task.taskId}`)
        }
        const screen: Screen = await makeOneScreen(prompt, this.userId)
        const html = await this.fetchDesignHtml(screen)

        const path = designFilePath(input.task.taskId, input.task.task)
        const writeRes = await this.sandbox.Execute(this.sandbox.sandboxId, { action: 'writeFile', path, content: html })
        if (!writeRes.success) {
            logger.warn(`Failed to save design to sandbox at ${path}: ${writeRes.content}`)
        }

        return html
    }

    private async fetchDesignHtml(screen: Screen): Promise<string> {
        let htmlUrl = await screen.getHtml();
        for (let attempt = 1; attempt <= 5 && !htmlUrl; attempt++) {
            logger.warn(`Screen ${screen.screenId} HTML not ready, retrying (${attempt}/5)`);
            await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
            htmlUrl = await screen.getHtml();
        }
        if (!htmlUrl) {
            throw new Error(`Stitch never returned an HTML URL for screen ${screen.screenId}`);
        }
        const res = await fetch(htmlUrl);
        if (!res.ok) {
            throw new Error(`Failed to fetch HTML for screen ${screen.screenId}: ${res.status} ${res.statusText}`);
        }
        return await res.text();
    }

    override async callLLM(input: UIExpertTaskInput, context: CoderContext): Promise<UIExpertLLMResponse> {
        if (this.htmlDesign === null) {
            this.htmlDesign = await this.runPhaseA(input, context.skills)
        }
        return await b.UIExpertAgent(UI_EXPERT_BASE_TEMPLATE_PROMPT, this.htmlDesign, context)
    }

    override async executeFunction(response: UIExpertLLMResponse): Promise<UIExpertAgentResponse> {
        if (
            response.action === 'read'
            || response.action === 'writeFile'
            || response.action === 'delete'
            || response.action === 'runCommand'
            || response.action === 'editFile'
        ) {
            const sandboxRes = await this.sandbox.Execute(this.sandbox.sandboxId, response)
            return {
                success: sandboxRes.success,
                response: sandboxRes.content
            }
        }
        else if (response.action === 'done') {
            return {
                success: true,
                response: `UIExpert base template completed`
            }
        }
        else if (response.action === 'abort') {
            return {
                success: false,
                response: response.reason
            }
        }
        return {
            success: false,
            response: "Unknown Error occurred"
        }
    }
}
```

Note what's removed from the old file: `craftDesignVariants`, `generateDesigns`, `fetchDesigns` (the main-agent-picker-flow methods) move to Task 9's `callAgent.ts` work — they're kept, just relocated, since they're still needed for the simple-path 3-screen picker. Confirm before deleting: Task 9 must land `craftDesignVariants`/`generateDesigns`/`fetchDesigns` somewhere `callAgent.ts` can still call them before deleting them here. Simplest: keep them in this file as additional methods on the same `UIExpert` class (it's still constructed the same way for the simple path in `callAgent.ts`) — add them back in unchanged from the current file, alongside the new Phase A/B methods above. Both flows share the class; they just serve different callers (`callAgent.ts`'s upfront picker vs. `SubAgent`'s DAG dispatch).

- [ ] **Step 6: Typecheck**

Run: `cd packages/agents && bunx tsc --noEmit -p .`
Expected: no errors in `uiExpert.ts`. `orchestrator.ts` errors remain until Task 8.

- [ ] **Step 7: Commit**

```bash
git add packages/agents/agent/subagents/uiExpert.ts packages/agents/agent/utils/designPath.ts packages/agents/agent/utils/designPath.test.ts
git commit -m "agents: give UIExpert a Phase A (design+save) and Phase B (base-template) loop"
```

---

## Task 8: `orchestrator.ts` — thread `updatedPrompt` into UIExpert input, broaden the merge-gate trigger

**Files:**
- Modify: `packages/agents/agent/orchestrator.ts`

**Interfaces:**
- Consumes: `UIExpertTaskInput` (Task 4), `this.updatedPrompt` (existing class field).

- [ ] **Step 1: Update `buildSubAgentInput`'s `uiExpert` case** (around line ~101-116) to match the new `UIExpertTaskInput` shape:

```ts
case 'uiExpert':
    return {
        task: {
            ...base,
            agentType: 'uiExpert',
            agentSpecificData: {
                screenId: state.screenId ?? `screen_${todo.id}_${Date.now()}`,
                mode: state.screenId ? 'update' : 'create',
                referenceScreenIds: Array.from(state.screenIdByTaskId.values()),
            },
        },
        agentType: 'uiExpert',
        updatedPrompt: this.updatedPrompt,
    } as unknown as InputMap[T]
```

(Drops the stale `callAgentContext`/`semanticMem`/`query` fields that never matched `UIExpertTaskInput` in the first place — they were unused dead weight under the old `as unknown as` cast.)

- [ ] **Step 2: Broaden the merge-gate trigger in `Execute()`** (around line ~353). Current:

```ts
const hadCoderTask = taskIds.some(id => this.todos.find(t => t.id === id)?.agent === 'coder')
```

Replace with:

```ts
// Both coder and uiExpert write files into the sandbox now, so both need
// the post-level build check + sync — a UI-only level was previously
// skipping this entirely, meaning its files never got a build check or an
// R2 sync until some later coder-containing level happened to trigger one.
const hadFileWritingTask = taskIds.some(id => {
    const agent = this.todos.find(t => t.id === id)?.agent
    return agent === 'coder' || agent === 'uiExpert'
})
if (hadFileWritingTask) {
```

(Update the two other references to `hadCoderTask` immediately below it in the same `if` block to `hadFileWritingTask`.)

- [ ] **Step 3: Typecheck**

Run: `cd packages/agents && bunx tsc --noEmit -p .`
Expected: no new errors anywhere in the package (only the pre-existing unrelated `edit.test.ts` ones remain).

- [ ] **Step 4: Commit**

```bash
git add packages/agents/agent/orchestrator.ts
git commit -m "agents: fix UIExpert input shape, run merge gate for UI-only DAG levels too"
```

---

## Task 9: `callAgent.ts` — reorder pipeline, save selected design to sandbox

**Files:**
- Modify: `packages/agents/agent/callAgent.ts`

**Interfaces:**
- Consumes: `UIExpert.generateDesigns`/`fetchDesigns` (existing, unchanged — kept in Task 7's `uiExpert.ts`), `designFilePath` (Task 7).

- [ ] **Step 1: Locate the current unconditional design-generation block** (`callAgent.ts:250-286`, the `let designsHtml = []` / `if(designs.length === 0){...}` block) and the complexity check above it (`callAgent.ts:~180-248`). Note there are three ways `complexity` (a `let` declared above line 195, not shown in this excerpt but in scope) ends up set: a cached-verdict path (line 203-206, sets `complexity = cachedIsComplex`, never touches `isComplex`), and a freshly-computed path (line 208-248, sets `complexity = isComplex.complex`, with a downgrade-to-simple special case at line 237-240). **Use `complexity`, not `isComplex.complex`** — `isComplex` is `undefined` on the cached-verdict path, so gating on it directly would break that path.

- [ ] **Step 2: Guard design generation on the simple verdict.** Wrap the existing `if(designs.length === 0){...}` block's condition:

```ts
let designsHtml: { html: string, prompt: string }[] = []
if(designs.length === 0 && !complexity){
    // ...existing body, unchanged...
}
```

For the complex path (`complexity === true` and `designs.length === 0`), skip straight past this block — no design generation, no picker return. Execution continues into whatever currently follows (the complexity-branch dispatch to `Orchestrator`/DAG planning), unchanged by this plan — the planner (Task 3) now handles UI todos itself.

- [ ] **Step 3: Save the selected design to the sandbox** at the point `this.selectedDesign` gets resolved from `data.selectedDesign` (`callAgent.ts:361`). Add immediately after that line:

```ts
this.selectedDesign = data.selectedDesign ?? ""
if (this.selectedDesign) {
    const path = `design/main-${this.projectId}.html`
    const writeRes = await this.sandbox.Execute(this.sandbox.sandboxId, { action: 'writeFile', path, content: this.selectedDesign })
    if (!writeRes.success) {
        logger.warn(`Failed to save selected design to sandbox at ${path}: ${writeRes.content}`)
    }
    await this.sandbox.SyncR2()
}
```

(Uses `this.projectId` rather than a screen-name slug — the simple path has exactly one selected design per project, not per-screen, so there's no `taskId`/`screenName` pair to build a `designFilePath`-style name from. This is a distinct, simpler naming case from Task 7's per-todo one.)

- [ ] **Step 4: Typecheck**

Run: `cd packages/agents && bunx tsc --noEmit -p .`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add packages/agents/agent/callAgent.ts
git commit -m "agents: judge complexity before design generation, save selected design to sandbox"
```

---

## Final verification (whole plan)

- [ ] Run the full package typecheck one more time: `cd packages/agents && bunx tsc --noEmit -p .` — only the pre-existing unrelated `edit.test.ts` errors should remain.
- [ ] Run the full test suite: `cd packages/agents && bun test` — new tests (`designPath.test.ts`, extended `skills.test.ts` if added) pass; nothing else regresses.
- [ ] Re-read `22_aug.planner.md` section by section and confirm each design decision has a corresponding completed task above (spec-coverage check): pipeline reorder → Task 9; mood/palette questions → Task 3 Step 3; UIExpert two-phase → Tasks 2, 3, 7; shared skill → Task 1; storage layout → Tasks 7, 9; planner rewrite → Task 3 Step 2; merge-gate/sync fix (found during planning, not in the original spec text but required by it) → Task 8.
