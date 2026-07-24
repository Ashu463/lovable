---
name: common-build-errors
description: Catalog of recurring build and runtime error signatures mapped to root cause and fix, built from actual observed run failures. Load this whenever an error doesn't cleanly match the general triage-protocol steps, or when the same error signature has been seen before.
---

# Common Build Errors

This file is intentionally seeded empty. It should be populated from real
RunEvent failure logs, not invented — a guessed catalog teaches nothing and
just adds context weight. Append an entry here every time the Debugger
resolves an error that isn't already covered.

## How to add an entry

For each recurring error, add a row with:

- **Signature** — the distinctive part of the error message/stack (enough
  to match on, not the full stack trace)
- **Cause** — the actual root cause, not the symptom
- **Fix** — the specific correct fix
- **Wrong fixes seen** — approaches that seemed to work but didn't, or that
  masked the problem instead of fixing it

## Catalog

| Signature | Cause | Fix | Wrong fixes seen |
|---|---|---|---|
| _(empty — populate from observed failures)_ | | | |

## Structure note

Once this table exceeds roughly 30–40 rows, split it by error family into
`references/` (e.g. `references/type-errors.md`, `references/build-tool.md`)
and turn this file into a router: state which reference file to read based
on the error signature, rather than keeping one giant table here.

## Do not

- Add a speculative entry for an error that hasn't actually been observed.
- Record only the fix without the root cause — future triage needs to know
  *why*, not just *what to type*.
- Let "wrong fixes seen" go unfilled — that column is often more valuable
  than the fix itself, since it stops the Debugger from re-trying a known
  dead end.