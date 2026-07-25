---
name: visual-verification
description: What to check when confirming a UI change actually renders correctly, beyond "the build passed." Use whenever a task touched anything visible, before reporting the tester result as passing.
---

# Visual Verification

`smoke-checklist` covers baseline checks for every task regardless of
subject; this is the additional pass specifically for anything that
renders visible UI.

## Checklist

- [ ] The touched screen(s) render with no console errors or unhandled
      rejections, not just a successful build.
- [ ] No layout overflow — content doesn't clip or force horizontal scroll
      at any width in the `responsive-rules` breakpoint scale, especially
      `base`.
- [ ] No broken/placeholder-looking image or icon left in place of a real
      asset (see `asset-policy`) unless it was explicitly meant to be a
      placeholder.
- [ ] Interactive elements are actually interactive — a button that should
      trigger an action does, a link points where it says it points.
- [ ] Loading and error states render as designed, not as a blank screen or
      raw unhandled fetch — check both, not just the happy path.
- [ ] Visual output matches the design record's tokens (`design-system`) —
      no off-palette colors, off-scale spacing, or inconsistent type sizes
      introduced by this change.

## Rules

- A passing build/typecheck is necessary but not sufficient — a screen can
  build cleanly and still render broken.
- If the design record for this screen doesn't exist yet, flag that rather
  than approving against no reference.
- Report failures against this checklist the same way as any other test
  failure — specific item, specific evidence, not a vague "looks off."

## Do not

- Mark a UI-touching task as passing on build success alone.
- Skip the checklist because the change "looks small" — small visual
  changes are exactly the ones most likely to be eyeballed instead of
  actually checked.
