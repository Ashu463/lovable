---
name: project-conventions
description: File layout, naming, and import rules for generated projects. Use this whenever creating, moving, or renaming any file, adding a component, page, hook, or utility, wiring up imports, or deciding where new code belongs. Consult this before writing the first line of any new file, even for a small change.
---

# Project Conventions

Structural rules for every generated project. These are not suggestions —
inconsistent structure across agents causes integration failures downstream.

## Directory layout

```
src/
├── components/     Reusable UI. One folder per component.
│   └── ui/         Base primitives. Do not hand-edit these.
├── pages/          Route-level components. One file per route.
├── hooks/          Custom hooks. One hook per file.
├── lib/            Pure utilities, no framework imports.
├── integrations/   External clients (db, third-party APIs).
└── types/          Shared types only. Component-local types stay local.
```

If the current project's actual layout differs from this (check the repo
before assuming), follow what's already there and do not restructure it.

## Naming

| Thing              | Case       | Example                        |
|---------------------|------------|---------------------------------|
| Component file      | PascalCase | `UserCard.tsx`                  |
| Hook file            | camelCase  | `useAuth.ts`                     |
| Utility file         | kebab-case | `format-date.ts`                 |
| Type/interface       | PascalCase | `interface UserProfile`         |
| Boolean prop/var     | is/has/can | `isLoading`, `hasError`         |

Never suffix components with `Component`. `UserCard`, not `UserCardComponent`.

## Imports

Use the project's configured path alias (e.g. `@/`) for anything under `src/`.
Relative imports only within the same folder.

```
// Wrong
import { UserCard } from '../../components/UserCard'

// Right
import { UserCard } from '@/components/UserCard'
```

Order: external packages → internal alias imports → relative imports → styles.
Blank line between groups.

## Component rules

- One exported component per file. Named export, not default export.
- Props interface declared directly above the component, named `<Name>Props`.
- No inline styles — use the styling system already in the project.
- If a component exceeds ~150 lines, extract subcomponents into the same folder.

## Adding a new route

Do all four steps below. A route added without navigation wired up is a
common and easy-to-miss failure.

1. Create the route file in `src/pages/`.
2. Register it in the router.
3. Add the nav entry if the route is user-reachable.
4. Add loading and error states — never render a bare unhandled fetch.

## Do not

- Create top-level directories outside the layout above without a clear reason.
- Hand-edit generated/vendored UI primitives — regenerate them instead.
- Add a dependency without checking whether an existing one already covers it
  (see `dependency-policy`).
- Leave `TODO`, placeholder text, or lorem-ipsum-style content in shipped output.

## Escape hatch

If the user explicitly requests a different structure, follow the user. Note
the deviation in your task summary so downstream agents don't fight it.