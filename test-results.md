# Test Run — 2026-09-13 (evening)

Run: `01a09b41` — "Build a platform where organizers can create events, manage
registrations, and track attendance. Only two pages." (event dashboard +
event detail, localStorage-backed, hash router, no backend by design).

## Wall clock

| Milestone | Time (IST) | Elapsed from start |
|---|---|---|
| EnumerateScreens dispatched (design phase start) | 20:32:48 | — |
| Level 0 done, first `Dev server started` | 20:45:46 | ~13 min |
| Level 1 (tasks 4/5) done | 20:54:31 – 21:07:09 | — |
| Task 6 (app-root wiring) done | 21:11:52 | — |
| `inngest/function.finished` (run end) | 21:13:10 | **~40 min total** |

For comparison, the cleanest earlier run this session (screens → build →
verified boot, no retries needed) took **~8.5 min** end to end. The ~40 min
here is almost entirely the cost of two tasks each needing a full retry
(see below) plus two debugger passes at the merge gate.

## Per-task iteration count (cap: coder=24, uiExpert=14)

| Task | Agent | Iterations used | Attempts | Notes |
|---|---|---|---|---|
| 1 | uiExpert | 24 (capped) | 1 | hit the 14-cap on paper but log shows 24 entries — see caveat below |
| 2 | uiExpert | 13 | 1 | converged, 1 turn of margin under the 14-cap |
| 3 | coder | 12 | 1 | converged cleanly |
| 4 | coder | 24 (capped), then converged | **2** | 1st attempt capped w/ 0 writes; 2nd converged at iter 10 |
| 5 | coder | 24 (capped), then converged | **2** | 1st attempt capped; 2nd converged at iter 16 |
| 6 | coder | 12 | 1 | app-root wiring, converged cleanly |

Caveat: task 1's raw iter count (24) exceeds its own `UI_EXPERT_MAX_ITERATIONS`
(14) in this tally — needs a closer look at whether that's two attempts
mislabeled as one by this grep, or a genuine cap mismatch. Flagging rather
than asserting.

Two of six tasks (4, 5) needed a full retry-from-scratch — both burned their
entire first attempt on read-only reconnaissance with zero `writeFile`, then
converged well inside budget on the second attempt.

## LLM call volume (BAML function calls, whole run)

| Function | Calls |
|---|---|
| CoderAgent | 137 |
| UIExpertAgent | 26 |
| GenerateSubagentSummary | 9 |
| DebuggerAgent | 7 |
| PlanTasks | 1 |
| GenerateUIPreferenceQuestions | 1 |
| GenerateClarifyingQuestions | 1 |
| EnumerateScreens | 1 |
| CheckIsDevelopmentRequest | 1 |
| CheckComplexity | 1 |
| CallAgentSummary | 1 |
| **Total** | **~186** |

`RUN_MAX_LLM_CALLS` is set to 120 but is not actually enforced anywhere in
code — this run alone would have tripped it if it were wired.

## Reliability signal

- **20** deepseek `Failed to parse LLM response` events over the whole run —
  all self-recovered on retry (`attempt 1/3`), none caused a task failure.
- **1** garbage-value tool call (`cwd: "string|null"`, a hallucinated type
  annotation passed as a literal path) — recovered cleanly, coder read the
  error and moved on.
- **2** debugger passes at the merge gate — one for a real TS null-check
  error (`event` possibly null), one for a CSS class-parity gap. Both
  resolved; final build passed and the tester reported the app boots.

## Known-broken as of this run

- **No `run_completed` emitted / no run summary or project title persisted**
  after the run reached its terminal state (`CallAgentSummary` ran but
  neither `saveRunSummary` nor `nameProjectIfUnnamed` fired in the log).
- **Preview shows the stock Vite starter, not the built app**, even after a
  hard refresh — suspected `GetPreviewUrl` short-circuiting on an already-live
  (but stale) dev server process instead of always restarting fresh. Under
  investigation.
