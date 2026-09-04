# Idea / todo queue

Running list of ideas surfaced in conversation but not yet brainstormed into a
spec. Each one gets its own brainstorming pass (bounded or architectural,
per superpowers:brainstorming) when picked up — this file is just a queue,
not a design doc.

## Queued

- **Real code editor for the code viewer** — `apps/frontend`. Current file
  viewer just dumps files with raw paths; wants a real editor (Monaco/
  CodeMirror-style) instead. Frontend-only, bounded scope, no
  `packages/agents` involvement expected.

- **Progressive / incremental live preview** — show the user the app as soon
  as it's in a displayable state (e.g. after task 5 of N), rather than only
  after full completion, with the planner deciding the checkpoint. Cross-app:
  planner (`packages/agents`), orchestrator (exposing intermediate sandbox
  state), frontend preview panel. Architectural.

- **Coder does per-task testing; Tester does one final full pass** — user
  observed "no mid testing, only after full completion" in a run. Needs
  verification before design: `Orchestrator.runMergeGate` (`orchestrator.ts:
  268-323`) already fires per DAG level via `hadFileWritingTask`
  (`orchestrator.ts:356-370`), not only at the end — so this may already be
  true structurally, and the observed run may have collapsed to one DAG
  level (linear plan, no parallel tasks), or gone through the older
  `callAgent.ts` path instead of `Orchestrator`. Extends `tester-fixing.md`.
  Blocked on: which log/run showed the "no mid testing" behavior.

- **SSE messages: task id + meaningful content, not "coder is working"** —
  `subAgent.ts:151` (`emitSSEUpdate`) already streams per-iteration progress
  (`type: 'subagent_progress'`) with structured data, so this is likely
  mostly a frontend rendering/formatting gap (map tool name + file path +
  task id into a readable string) rather than a backend gap — needs
  confirming what fields the SSE payload actually carries today before
  assuming it's frontend-only.

- **"Talkative agent" — route conversational/question messages away from
  the build pipeline** — today every user message appears to go through the
  full build/edit path, so asking a question about the app's architecture
  can trigger unwanted changes. Needs an intent-classification gate before
  the DAG/sandbox spins up: {conversational question} vs {build/change
  request}, with the conversational branch answered by a lightweight
  read-only agent (repo tree + prior task summaries, no sandbox mutation).
  Related to the already-flagged follow-up in `22_aug.planner.md`'s open
  items: decoupling general clarification from the complexity verdict into
  its own independent LLM call — these two probably want to be designed
  together as one router gate, not two separate bolt-ons.
