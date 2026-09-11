# System Prompt Structure — reference for rewriting the prompts in `systemPrompts.ts`

Two categories only. The dividing question is: **does it loop and touch the
sandbox?** Yes → Agent (Structure B). No → Simple call (Structure A).

---

## Ways to inject a system prompt in BAML

1. **Parameter injection** (current default) — `function X(systemPrompt: string, …)`
   + `{{systemPrompt}}`. String lives in `systemPrompts.ts`, editable without
   regenerating BAML. Keep this.
2. **`_.role("system")` / `_.role("user")`** — splits the rendered prompt into
   real chat turns. Only `uiExpert.baml` uses it today; spread it everywhere.
   Payoff: correct chat semantics + **prompt caching** (static system turn first).
3. **Inline in the `.baml` prompt block** — for truly static instructions; loses
   edit-without-regen. Avoid for anything you're tuning.
4. **`template_string`** — reusable fragments. Use for the ENVIRONMENT grounding
   so it's byte-identical across coder / uiExpert / debugger and can't drift.

---

## The BAML shell (both structures slot into this)

```
function X(systemPrompt: string, <inputs>) -> <OutputType> {
    client ...
    prompt #"
        {{ _.role("system") }}
        {{systemPrompt}}          // authored structure below — STATIC, cached
        {{ _.role("user") }}
        {{ input1 }}              // request / upstream data — VARIABLE
        {{ ctx.output_format }}   // auto-injected schema — never restate it
    "#
}
```

Rule: static in the system turn, request-specific data in the user turn.

---

## Structure A — Simple BAML call (one-shot: classify / transform / generate)

```
# ROLE
  1–2 sentences: what this function is and the single decision/transformation
  it makes. Light persona.

# GIVEN  (pipeline position — omit only for a true entry point)
  Where this call sits in the ideal flow: what stages ran before it (so it
  assumes their results and does NOT re-do them) and what consumes its output.
  Prose about the flow, NOT the data (data is a user-turn param).

# CRITERIA  (or TASK, for transforms)
  The rule mapping inputs to output. The meat for judgment calls.
  ▸ CoT: for judgment-with-cost, add "reason through X first" + a `reasoning`
    field placed BEFORE the decision field in the output class.

# CONSTRAINTS
  Hard rules / edge cases. "Flag / express uncertainty rather than guess."
  "Trust upstream results as decided; if inconsistent, flag — don't silently
  compensate."

# OUTPUT  (semantics only)
  What fields MEAN when the schema can't say it. Skip if ctx.output_format is
  self-explanatory. Note reasoning-then-decision order if using CoT.
```

No ENVIRONMENT / ACTIONS / BUDGET — these don't touch the sandbox or loop.

---

## Structure B — Agent (iterated loop with tools)

```
# ROLE & SCOPE
  Persona + what it does AND explicitly what it does NOT do. Scope boundary is
  load-bearing (half the uiExpert stall was "mine or the next item's?").

# GIVEN  (pipeline position)
  What already happened (don't redo it) and what runs after. e.g. Coder: "the
  base template already exists from the uiExpert; your job is behavior."

# ENVIRONMENT
  Sandbox truth: Vite + React + TSX, .tsx wired into App.tsx, never standalone
  index.html, preview renders App.tsx.
  ▸ Inject via a shared template_string (identical across agents, no drift).

# HOW YOU WORK  (decision framework)
  Heuristics at the right altitude — "first check X; if Y then Z" — NOT a rigid
  script. Safety-net framing: work is isolated in a git worktree and verified
  by the merge gate + debugger before it lands, so bias toward acting over
  inspecting.

# ACTIONS
  The tool menu and when to reach for each.

# BUDGET & STALL AWARENESS
  Soft budget from expectedToolCalls: "~N tool calls; if past N and still
  re-reading the same files, you're stalling — commit or emit Done." Soft.

# CONSTRAINTS
  Hard rules. Destructive-op warnings (delete) framed narrowly, not a blanket
  "irreversible." "Never Done while the build is failing."

# OUTPUT
  One action per turn; action-field semantics; never emit tool-call markup.
```

---

## `_.role` mapping (where caching pays off)

- **Simple call:** whole A-structure → system turn (cached). Upstream data +
  request → user turn. CoT lives in the output schema, not the prompt.
- **Agent:** ROLE&SCOPE / GIVEN / ENVIRONMENT / HOW-YOU-WORK / ACTIONS / BUDGET /
  CONSTRAINTS / OUTPUT → system turn (cached across every loop iteration). Only
  task + evolving context → user turn. Biggest caching win, since an agent
  re-sends its system prompt each iteration.

---

## Strategy → section cheat-sheet

- **Environment grounding** → ENVIRONMENT (agents), via shared `template_string`.
  **Do this first — it's the actual vanilla-HTML-in-a-React-project bug.**
- **CoT** → CRITERIA instruction + leading `reasoning` field. ONLY judgment-with-
  cost: complexity checker, merge-conflict resolver, PlanTasks. NOT conversational
  reply (generation, not decision); light-at-most for dev-gate (near-binary).
- **Prompt chaining** → GIVEN (flow orientation) + upstream data as user-turn param.
- **Budget** → BUDGET & STALL (agents), consuming `expectedToolCalls`.
- **Safety-net, NOT irreversibility** → HOW YOU WORK (agents). Emphasize the
  worktree/merge-gate safety net to encourage action; framing danger induces the
  over-caution that caused the stall.
- **Uncertainty permission** → CONSTRAINTS (both).

---

## Which existing prompt is which

**Structure A (simple calls):** DEVELOPMENT_GATE_PROMPT, CONVERSATIONAL_REPLY_PROMPT,
COMPLEXITY_CHECKER_PROMPT*, CLARIFICATION_PROMPT, UI_PREFERENCE_PROMPT,
ENUMERATE_SCREENS_PROMPT, PLAN_TASKS_PROMPT*, UI_VARIANTS_PROMPT (FramePrompts),
MERGE_CONFLICT_RESOLVER_PROMPT*, TESTER_ERROR_REFACTOR_PROMPT (ReframeError),
AGENT_SUMMARY_PROMPT, CALL_AGENT_SUMMARY_PROMPT, SUBAGENT_SUMMARY_PROMPT,
COMPACT_CONTEXT_PROMPT, SUMMARIZE_CONTEXT_PROMPT, EPISODIC_MEMORY_GENERATOR_PROMPT,
COMPRESS_EPISODIC_MEM_PROMPT.   (* = CoT candidate)

**Structure B (agents):** AGENT_SYSTEM_PROMPT (main agent), CODER_PROMPT,
UI_EXPERT_BASE_TEMPLATE_PROMPT, DEBUGGER_PROMPT.

---

## Don't forget while rewriting

- **Grounding first** — Vite/React/TSX shared `template_string`. It's the root bug.
- **Consume the two new planner fields** the pipeline already produces:
  `input.task.description` (fuller intent → into the subagent's context/prompt) and
  `input.task.expectedToolCalls` (→ the BUDGET & STALL section).
- **Static-first ordering** everywhere for caching.
