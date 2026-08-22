# Tester → eval gate: visual + functional quality loop — design spec

Date: 2026-08-22
Status: approved, moving to implementation (pending plan)

## Why

Today's Tester (`agent/subagents/tester.ts`) only checks whether the app
boots — it never looks at what got built. Two gaps this closes:

1. No functional-vs-visual distinction. A todo can "pass" (dev server boots)
   while rendering something that doesn't remotely match the UIExpert design
   it was supposed to implement — nothing catches that today.
2. Debugger only ever sees stack traces. It has no path to receive "this
   looks wrong" feedback and no design-related skills to act on it.

This spec extends the existing Tester/Debugger merge-gate loop with a scored
visual-fidelity check, reusing the loop's existing retry/cutoff machinery
rather than building a second one.

## Scope

In scope: a new visual-comparison step in Tester, a screenshot-acquisition
utility, a new vision BAML call, extending `DebuggerContext`/`DEBUGGER_PROMPT`
to act on visual-mismatch feedback, extending the no-progress cutoff to
handle a continuous score instead of a discrete error signature, and
persisting a reference image for the simple (picker) path.

Out of scope: replacing the functional (build/boot) check — it stays as-is;
building a general pluggable eval-framework abstraction; adding an automated
test-suite convention (`npm run test`) for generated apps — that's a
separate decision (whether Coder/UIExpert should emit tests at all) not
bundled into this spec.

## Current state (for reference)

- `TesterAgent.testCodebase()` (`agent/subagents/tester.ts:26-58`) boots
  `npm run dev` in the sandbox and polls the port (`pollUntilUp`, lines
  60-72). No LLM call in the success path.
- On boot timeout only, it calls `callLLM` (lines 74-84) →
  `b.ReframeError(TESTER_ERROR_REFACTOR_PROMPT, error, context)`, which turns
  raw stderr into `ErrorResponse { error, file, line }`
  (`baml_src/testerAgent.baml:3-26`). This stays as-is — LLM text-reframing
  of heterogeneous compiler/runtime errors is the right tool here, a regex
  replacement would be brittle.
- `DebuggerAgent` (`agent/subagents/debugger.ts`) is already a full tool-loop
  agent (`ReadFile | RunCommand | WriteFile | EditFile | Research | GetSkill
  | DebuggingDone | Abort`, `baml_src/debuggerAgent.baml:23-46`), driven by
  `DebuggerContext { repoTree, originalError, fixHistory: Fixes[], skills,
  recentTurns }` (lines 15-21).
- Merge-gate loop (`CallAgent.TesterDebuggerLoop`, `callAgent.ts:565-647`,
  mirrored in `Orchestrator.runMergeGate`, `orchestrator.ts:268-323`):
  `preDeployCheck` (build, lines 649-661) → on failure, Tester → ReframeError
  → signature `fileName:error` → if repeated twice, halt ("no-progress
  cutoff") → else Debugger → SyncR2 → re-run build. Capped at
  `TESTER_DEBUGGER_LOOP_MAX_ITERATIONS = 3` (`systemConfig.ts:31`).
- Stitch **already returns a screenshot URL**: `Screen.getImage()`
  (`agent/tools/stitch.ts:39-47` fetches both `getHtml()` and `getImage()`
  via `Promise.all`), but only the HTML is ever propagated downstream
  (`uiExpert.ts` `fetchDesigns`/`fetchDesignHtml`; `callAgent.ts:265-266`
  `designsHtml`). The image URL is currently discarded.
- `E2BSandbox.GetPreviewUrl()` (`agent/utils/sandbox.ts:328-360`) already
  returns a public, externally-reachable HTTPS URL for the running dev
  server (restarts Vite with `--host 0.0.0.0`/`allowedHosts` if needed).
- No screenshot/render/vision capability exists anywhere in the repo today.
  `skills/visual-verification/SKILL.md` is a text checklist handed to an
  LLM, not an actual rendering mechanism.
- Simple-path picker persists only `htmlContent` + `prompt` to Postgres
  (`Design` table) for the selected variant — no image URL saved.

## Design

### 1. Screenshot acquisition — third-party service, not a local browser

Vision LLM APIs take actual image content (base64 or a URL resolving to an
image file) — handing them a live webpage URL doesn't work, there's no
renderer in that path. Rather than standing up Playwright/Puppeteer (new
dependency, new sandbox-adjacent process to manage), use a
screenshot-as-a-service API: give it `GetPreviewUrl()`'s public URL, get back
an image URL. New small utility, e.g. `agent/tools/screenshot.ts`:
`captureScreenshot(url: string): Promise<string>`. No sandbox changes, no
heavy new dependency.

Provider choice is an open item (see below) — needs a genuine free tier at
expected volume, verified at implementation time rather than assumed.

### 2. New BAML vision call: `CompareResults`

Add a vision-capable BAML function, e.g. in `baml_src/testerAgent.baml`:

```
function CompareResults(
  systemPrompt: string,
  referenceImageUrl: string,
  implementationImageUrl: string,
  priorAttempts: Fixes[]
) -> ComparisonResult   // { score: int, notes: string }
```

`priorAttempts` lets the judge see whether earlier fix attempts moved the
score, not just the latest snapshot. Model choice: whichever vision-capable
client is already configured in BAML client config — pick from what's
already wired (Claude/GPT-4o/DeepSeek-VL are all viable) rather than
integrating a new provider just for this call. Request the screenshot at a
reduced width (~768px) via the service's params to control vision-token
cost — a config parameter, not new code.

### 3. Tester's extended role

`testCodebase()` gains a third branch, only for todos carrying a design
reference (complex-path UIExpert `getImage()` URL, or simple-path's selected
variant image once persisted — see open items): after build+boot succeed,
`captureScreenshot(GetPreviewUrl())` → `b.CompareResults(...)`. Result
`{score, notes}` attaches to `TesterResponse` as a new optional field
alongside the existing `{success, errorRes}`. Todos with no design reference
skip this branch entirely — cost stays scoped to UI todos only.

### 4. Debugger's extension

- **Skills:** add `ui-base-template` (and other design-relevant skills
  already used by Coder/UIExpert) to Debugger's `ROLE_SKILLS` entry — same
  mechanism already in place, no new plumbing.
- **Context:** extend `DebuggerContext` so `originalError` can alternatively
  carry a visual-mismatch shape `{score, notes, referenceImageUrl,
  implementationImageUrl}` instead of a stderr-derived `Error`. Extend
  `Fixes` (already accumulated in `fixHistory`) to optionally carry a
  `visualScore`, so Debugger sees the trend across attempts.
- **Prompt:** `DEBUGGER_PROMPT` (`systemPrompts.ts:529+`) gets a new section
  for acting on a visual-mismatch payload (layout/CSS/spacing per `notes`),
  alongside its existing stack-trace-driven section.

### 5. Loop / cutoff logic

- Trigger: visual score `< 5` enters the fix loop (functional build failure
  triggers it exactly as today, unchanged).
- The existing no-progress cutoff (identical error signature repeating
  twice) doesn't apply to a continuous score. Add a parallel rule: abort if
  score fails to improve by `≥ 1` point across 2 consecutive iterations.
- Hard cap stays shared: `TESTER_DEBUGGER_LOOP_MAX_ITERATIONS = 3`
  (`systemConfig.ts:31`) — one budget across both functional and visual fix
  attempts, not two separate budgets.
- On loop exhaustion without reaching threshold: same failure shape as
  today's build-failure exhaustion — surfaces to merge gate as a failed
  todo. No "ship anyway" special case.

### 6. Cost controls

- Screenshot + vision call only fires for todos with a design reference.
- Screenshot requested at reduced resolution before it reaches the vision
  call.
- Vision provider reuses whatever's already configured in BAML client
  config rather than adding a second LLM provider integration.

## Error handling

- Screenshot-service failure (timeout/5xx) → treated as inconclusive, not
  `score = 0`. Falls back to functional-only gating for that iteration;
  logged, doesn't block merge on a third-party outage.
- `CompareResults` BAML call failure → same fallback as above.

## Testing

Per project convention (testing done by the user directly), no automated
suite added by this spec. Verification: a complex run with a UI todo whose
Coder-implemented screen visibly diverges from the Stitch reference produces
a sub-5 score, triggers Debugger with the visual context, and a second pass
either improves the score or the loop exhausts cleanly per the cutoff rule.

## Open items carried forward (not blocking this spec)

- Which screenshot-as-a-service to use — needs a provider with a genuine
  free tier at expected volume; verify current pricing/limits at
  implementation time, don't assume from memory.
- Which vision-capable model backs `CompareResults()` — confirm against
  whatever's already configured in BAML client config.
- Exact wording of the new visual-mismatch section in `DEBUGGER_PROMPT`.
- Simple-path reference image: today's `Design` table stores `htmlContent`
  only. Needs the selected variant's `getImage()` URL persisted too (mirrors
  the 22_aug.planner.md plan to store the selected variant's HTML in the
  sandbox) so simple-path Coder todos have something to compare against.
