---
name: state-management-rules
description: When to use local component state vs. a shared/global store, and the conventions for each. Use whenever a task introduces new state, lifts existing state, or touches how data flows between components.
---

# State Management Rules

## Deciding where state lives

- **Local (component) state** — default choice. Use it when the state is
  only ever read or set by the component that owns it and its direct
  children via props.
- **Lifted state** — when two sibling components need the same state, lift
  it to their nearest common ancestor and pass it down. Don't reach for a
  global store just because two components need to share one value.
- **Global/shared store** — only when state is genuinely cross-cutting
  (auth session, theme, cart contents, anything read from 3+ unrelated
  parts of the tree). Use the project's existing store solution — don't
  introduce a second state-management library alongside one already in use
  (see `dependency-policy`).

## Server/remote data

Treat data fetched from an API or database as a distinct category from UI
state — don't stuff fetched data into the same store/state as ephemeral UI
state (open/closed, selected tab, form draft). Use the project's existing
data-fetching layer if one exists; keep loading/error/success as part of
that fetch's own state, not hand-rolled per component.

## Rules

- Never duplicate the same piece of truth in two places (e.g. a local copy
  of a value that's also in the global store) — read from the single
  source, don't mirror it.
- Derived values (computed from existing state) are computed at read time,
  not stored as separate state that can drift out of sync.
- Keep state as close to where it's used as the sharing requirement allows
  — don't default to global for convenience.

## Do not

- Add a new state-management dependency when the project already has one in
  use, even if a different one is more familiar.
- Store form input values in a global store — see `form-handling` for form
  state specifically.
- Put fetched/server data and local UI state in the same state container.
