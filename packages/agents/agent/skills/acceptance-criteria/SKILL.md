---
name: derive-acceptance-criteria
description: Turns a task description into concrete, checkable pass/fail assertions before testing begins. Use before writing or running any test, and whenever a task's "done" condition is ambiguous or implicit.
---

# Derive Acceptance Criteria

Before running anything, convert the task into a list of assertions that
are each independently checkable as true/false. If you can't tell whether
an assertion passed or failed by inspection or a command's output, rewrite
it until you can.

## Procedure

1. Read the original task/task-node description and the design record (if
   any UI is involved).
2. Write out explicit criteria covering:
   - **Functional** — what the feature must actually do (e.g. "submitting
     the form with valid input creates a record and redirects")
   - **Structural** — build passes, no type errors, no unresolved imports
   - **Visual** (if UI involved) — matches the design record's tokens, no
     layout overflow, responsive at standard breakpoints
   - **Negative cases** — what must NOT happen (e.g. "invalid input does
     not submit," "no console errors on load")
3. Do not invent criteria the task never implied — stick to what was asked
   plus baseline quality bars from `smoke-checklist`.
4. If the task is genuinely ambiguous about what "done" means, surface that
   rather than guessing a scope.

## Format

Write each criterion as a single falsifiable statement, not a vague goal.

Wrong: "The form should work well."
Right: "Submitting the form with all required fields filled shows a success
state and clears the form. Submitting with a required field empty shows an
inline error and does not submit."

## Do not

- Test only the happy path because it's what the task description led with.
- Treat "it renders without crashing" as sufficient acceptance criteria for
  anything with actual logic in it.
- Skip this step for small tasks — a one-line criteria list still catches
  more than testing on vibes.