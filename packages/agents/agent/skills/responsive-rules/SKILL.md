---
name: responsive-rules
description: Breakpoint scale, mobile-first authoring order, and the touch-target/overflow rules generated UI must satisfy at every width. Use whenever writing or reviewing markup that will render at more than one viewport size — which is effectively every page and component.
---

# Responsive Rules

Companion to `design-system` — that skill owns tokens (color/spacing/type),
this one owns how those tokens get applied across viewport widths.

## Breakpoint scale

| Name | Min width | Typical target        |
|------|-----------|------------------------|
| base | 0px       | phones                 |
| sm   | 640px     | large phones/small tablets |
| md   | 768px     | tablets                |
| lg   | 1024px    | small laptops          |
| xl   | 1280px    | desktops               |

Use the project's existing breakpoint tokens/config if the project already
defines them. Only fall back to the scale above for a brand-new project.

## Authoring order

Write the base (mobile) layout first, then layer overrides upward for wider
viewports. Never write a desktop-first layout and try to compress it down —
that's how horizontal scroll and clipped content happen.

## Rules

- Every interactive element (button, link, input) has a touch target of at
  least 44x44px on `base`/`sm`, even if it looks smaller visually.
- No fixed pixel widths on containers that can appear on `base` — use
  relative units (`%`, `fr`, `auto`) or an explicit max-width with fluid
  fallback.
- Text and media containers get `overflow-x` handled explicitly (wrap,
  scroll-in-own-container, or truncate) — the page body itself must never
  scroll horizontally.
- Navigation collapses to a mobile pattern (drawer/sheet/hamburger) below
  `md` unless the project's existing nav already establishes a different
  pattern — match what's there.
- Images and embeds get `max-width: 100%` and a defined aspect ratio so
  layout doesn't shift while they load.

## Do not

- Ship a component verified only at desktop width — check `base` before
  calling anything done.
- Hide content entirely at narrow widths as a substitute for actually
  adapting the layout, unless the content is genuinely non-essential there.
- Introduce a one-off breakpoint outside the scale above without a stated
  reason.
