---
name: layout-patterns
description: Named page-level layout paradigms (dashboard, marketing/landing, content-detail, form-flow) and which structural pattern to reach for given what a screen needs to do. Use when generating a new screen's structure, before filling in individual components.
---

# Layout Patterns

Structural vocabulary for `design-system`'s variant-generation step — use
this to make each of the three generated variants a genuine structural
choice, not just a palette swap of the same skeleton.

## Patterns

- **Dashboard** — sidebar/topbar navigation + a content area organized into
  cards/panels of varying size. Use for anything data-dense with multiple
  simultaneous views (metrics, tables, status).
- **Marketing/landing** — full-width sections stacked vertically (hero,
  feature blocks, social proof, CTA), each section typically full-bleed with
  internal max-width content. Use for anything meant to persuade/convert a
  visitor, not for authenticated app screens.
- **Content-detail** — a single primary content column (article, product,
  profile) with optional secondary rail for metadata/related items. Use for
  screens centered on one entity.
- **Form-flow** — a constrained-width single column, often multi-step, with
  a persistent primary action. Use for anything whose main job is collecting
  structured input (checkout, onboarding, settings).
- **List/grid** — a repeated-card collection with filter/sort controls above
  it. Use for browsing a collection of similar items.

## Choosing a pattern

Pick from what the screen actually needs to do, not from visual preference —
two variants exploring "more minimal vs. more dense" should still both be
dashboards if the screen is a dashboard; the pattern is structural, density
and style are what "design direction" varies.

## Rules

- State which pattern a screen uses explicitly in the design record so Coder
  implements the intended structure rather than inferring one from the
  prompt text alone.
- Don't mix two patterns in one screen without a clear reason (e.g. a
  dashboard screen that also embeds a full marketing section) — that usually
  means the screen should be split.
- Respect `responsive-rules` for how each pattern collapses at narrower
  widths (e.g. dashboard sidebar becomes a drawer, multi-column
  content-detail becomes single-column).

## Do not

- Default every screen to the same pattern regardless of purpose.
- Invent a new named pattern outside this list without stating why none of
  the above fit.
