---
name: scaffold-new-project
description: What must exist before any feature work starts on a brand-new (empty) project — base tooling, folder skeleton, and the first commit's contents. Use only for the very first task in a Run against an empty repo, not for adding to an already-scaffolded project.
---

# Scaffold New Project

This runs once per project, for the item that establishes the base
repository. Every later item assumes this already happened — don't repeat
scaffolding steps inside a feature task.

## Before scaffolding

Check the repo tree first. If it's not actually empty (an existing
package.json, framework config, or `src/` already present), this item is
scoped wrong — stop and treat it as a normal feature task against the
existing project instead of re-scaffolding.

## What the initial commit must contain

1. Package manifest with the runtime/framework already decided for this
   project (don't ask — infer from the task/design context; default to the
   stack already implied by `project-conventions` if nothing else specifies
   one).
2. The directory skeleton from `project-conventions` (`components/`,
   `pages/`, `hooks/`, `lib/`, `integrations/`, `types/`) — created with real
   files establishing the pattern (e.g. a minimal home page, a root
   layout), not empty placeholder folders.
3. A working dev/build/lint script wired in the manifest, verified with
   `RunCommand` before moving on — the first task in the plan should never
   leave the project in a state where the standard commands don't run.
4. Base styling/token setup matching whatever `design-system` record exists
   for this Run, if a design has already been selected at this point.
5. `.gitignore` appropriate to the stack (dependency dirs, build output,
   env files).

## Rules

- Don't pre-build features or pages beyond what establishes the pattern —
  scaffolding is infrastructure, not the first feature.
- Don't pick a different framework/library than what the design/task context
  implies just because it's more familiar.
- Verify the scaffold actually builds and runs before marking this item
  done — a scaffold that doesn't build blocks every subsequent item.

## Do not

- Scaffold on top of a non-empty repo without checking first.
- Leave the dev/build command unverified.
- Introduce a dependency here that `dependency-policy` wouldn't approve for
  a normal feature task — scaffolding isn't exempt from that check.
