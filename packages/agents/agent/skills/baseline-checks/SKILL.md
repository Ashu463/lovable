---
name: smoke-checklist
description: Fixed baseline checks (build passes, no console errors, all routes render, no unresolved imports, no placeholder content) that apply to every task regardless of what it was about. Use before marking any task complete or reporting results to the orchestrator.
---

# Smoke Checklist

Run this in full before reporting any task as complete — regardless of how
small the task was. These catch the failures that don't show up in
feature-specific testing.

## Checklist

- [ ] Build/compile succeeds with no errors
- [ ] No new type errors introduced
- [ ] No unresolved/broken imports
- [ ] Every route touched by this task renders without a console error
- [ ] No `TODO`, placeholder text, or lorem-ipsum-style content left in
      anything user-facing
- [ ] No leftover debug logging (`console.log` used for debugging, not
      intentional app logging)
- [ ] Existing functionality outside the task's scope still behaves the
      same (spot-check, not a full regression pass)
- [ ] If the task touched navigation, the new/changed route is actually
      reachable from the UI, not just defined in the router

## Reporting

If any item fails, do not report the task as complete — report the
specific failing item back through the normal failure path (to Debugger,
or `clarification_needed` if the failure indicates a scope problem, not a
bug).

## Do not

- Mark a task complete based on "the code looks right" without actually
  running the build/tests.
- Skip this checklist because `derive-acceptance-criteria` already covered
  feature-specific behavior — this is the baseline layer underneath that,
  not a replacement for it.