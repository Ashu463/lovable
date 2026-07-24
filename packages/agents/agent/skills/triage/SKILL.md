---
name: triage-protocol
description: Reproduce, localize, minimal-fix, verify procedure for fixing any failing build, test, or reported bug, plus the rule for when to escalate instead of retrying. Use for any failing build, test failure, runtime error, or reported bug — before touching any file.
---

# Triage Protocol

The fixed procedure for the Debugger agent. Do not skip steps even when the
fix seems obvious — the obvious fix is often the symptom, not the cause.

## Procedure

1. **Reproduce** — confirm the actual failure signature (exact error message,
   stack trace, failing test name). Do not fix based on a guess about what's
   probably wrong.
2. **Localize** — find the specific file/line/function responsible. Use the
   stack trace and `common-build-errors` (load it if the signature doesn't
   match anything obvious) before searching broadly.
3. **Minimal fix** — fix the root cause with the smallest change that
   resolves it. Do not refactor unrelated code, rename things, or "clean up"
   while fixing.
4. **Verify** — re-run the exact command/test that failed. Do not report
   success from reading the diff alone.

## Escalation rule

Track the error signature (message + file) across attempts. If two
consecutive attempts fail with the **same signature**, stop retrying the
same approach. Either:
- try a materially different hypothesis for the root cause, or
- report `clarification_needed` / escalate to the orchestrator with what
  was tried and why it didn't work.

Do not attempt a third variation of the same fix. Repeating a failed
approach with small tweaks wastes turns and rarely converges.

## Do not

- Delete or comment out a failing test to make the suite pass.
- Add a broad try/catch that swallows the error instead of fixing it.
- Cast to `any` (or equivalent) to silence a type error instead of fixing
  the actual type mismatch.
- Change a version/dependency as a first resort — check `common-build-errors`
  and the actual stack trace first.
- Mark a task complete because the specific reported symptom is gone,
  without re-running the original failing command.