----------DO NOT USE THIS SKILL UNTIL UI EXPERT IS READY--------------------------------
---
name: design-system
description: Tokens, spacing scale, typography, color palette, and the Stitch design-variant workflow for generated UI. Use whenever writing or editing any component that renders visible markup, choosing colors/spacing/fonts, generating design variants from a user prompt, or reviewing UI for visual consistency. Always consult before hardcoding a style value or before UIExpert generates designs.
---

# Design System

Rules for keeping generated UI visually coherent across every agent that
touches it, and for how UIExpert's Stitch-generated design variants flow
into the Coder.

## Design-variant workflow (UIExpert)

For any task that generates or substantially reshapes UI, do not go straight
from the user prompt to a single design. Instead:

1. Generate **three prompt variations** of the original user request —
   distinct enough to explore different visual directions (e.g. more
   minimal vs. more editorial vs. more dense/dashboard-like), but each still
   a faithful interpretation of what the user actually asked for. Do not
   invent requirements the user didn't imply.
2. Run each variation through the Stitch SDK to produce three candidate
   designs.
3. Select (or have the orchestrator/user select) the design to proceed with.
4. Record the **selected variant's tokens** — palette, spacing, type scale,
   component shapes — into the shared design record (see below). This
   record, not the Stitch output itself, is what the Coder reads.

## Design record: the sync contract with Coder

UIExpert and Coder must never independently re-derive style decisions from
the same user prompt — that produces mismatched output (different accent
colors, different spacing rhythm) even when both are "right" individually.

The design record is the single source of truth once a variant is chosen.
It must include:

- Color palette (primary, secondary, accent, neutral scale, semantic colors
  for success/warning/error)
- Type scale (font family, size steps, weight steps)
- Spacing scale (base unit and multiples in use)
- Border radius and shadow conventions
- Any component-shape decisions from the chosen Stitch variant (e.g. pill
  buttons vs. rounded-rect, card elevation style)

Coder reads this record before writing any styled markup for the task. If
the record doesn't exist yet for a task that needs one, Coder should not
guess — flag it back to the orchestrator rather than inventing values that
UIExpert will later contradict.

## Baseline tokens (used when no variant-specific record exists)

Use the project's already-established tokens if the project has prior UI.
Only fall back to defaults below for a brand-new project with no existing
design record.

| Token          | Default                                   |
|----------------|--------------------------------------------|
| Spacing unit   | 4px base, scale: 4/8/12/16/24/32/48/64      |
| Radius         | sm: 4px, md: 8px, lg: 12px, full: 9999px    |
| Font sizes     | 12/14/16/18/24/32/40                        |
| Font weights   | 400 regular, 500 medium, 600 semibold, 700 bold |

## Rules

- No hardcoded hex/px values in component markup — reference the design
  record or the project's token source (theme file, CSS variables, config).
- One accent color per project. Don't introduce a second "primary" color
  mid-project.
- Match the spacing scale exactly — no arbitrary values like `padding: 13px`.
- Icon set, once chosen for a project, stays consistent — don't mix icon
  libraries within one app.

## Do not

- Generate only one design variant when three were expected — the point is
  giving the user/orchestrator a real choice, not rubber-stamping the first
  attempt.
- Let Coder style a component before the design record exists for that task.
- Silently override a token from the design record because a value "looks
  better" — if it's actually wrong, flag it, don't just diverge.
