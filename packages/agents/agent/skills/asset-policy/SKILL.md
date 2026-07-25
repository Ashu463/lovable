---
name: asset-policy
description: Where images, icons, and fonts are allowed to come from, and the rules for placeholder vs. real assets. Use whenever a design or task calls for an image, icon set, or font that isn't already established in the project.
---

# Asset Policy

## Icons

- Use one icon library per project, chosen once and reused — check what's
  already in use before picking one for a new screen.
- Never hand-draw an SVG icon when the chosen library already has an
  equivalent.

## Images

- Never fabricate a real-looking photo URL or hotlink an arbitrary external
  image — use the project's actual asset pipeline, or an explicit,
  clearly-labeled placeholder (solid color / placeholder service meant for
  that purpose) if no real asset exists yet.
- A placeholder must be visually obvious as a placeholder (not a URL that
  might silently 404 or point at unrelated content) — this is part of what
  `visual-verification` checks for.
- Any real image asset gets an explicit width/height or aspect-ratio to
  avoid layout shift on load (see `responsive-rules`).

## Fonts

- Use the font family already declared in the design record/tokens. Don't
  introduce a second typeface family mid-project.
- Load fonts through the project's existing mechanism (bundled asset,
  configured provider) rather than an ad hoc external `<link>`.

## Rules

- New asset dependencies (icon package, font package) go through
  `dependency-policy` like any other dependency.
- Keep asset file sizes reasonable for the web — don't embed an
  unnecessarily large source image when a smaller one covers the actual
  rendered size.

## Do not

- Link to an external image/icon URL that isn't guaranteed to keep working.
- Mix icon libraries or font families within one project.
- Ship a broken or placeholder-looking asset without labeling it as such in
  the task summary.
