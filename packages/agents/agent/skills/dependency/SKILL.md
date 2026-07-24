---
name: dependency-policy
description: Approved libraries and the bar for adding a new dependency, including version compatibility checks against the current environment. Use whenever considering npm install, importing a package not already in package.json, or facing a problem that "a library could solve." Check this before adding any dependency, not after.
---

# Dependency Policy

## Before adding anything

1. Check `package.json` — is something already installed that covers this?
   Don't add a second library for a problem an existing dependency solves.
2. Check whether the standard library / framework already covers it
   (e.g. don't add a date library for something `Intl` handles).
3. If a new dependency is genuinely needed, verify **version compatibility
   with the current environment** before installing:
   - Node/Bun/runtime version actually in use in this project
   - Existing major versions of related packages (framework version,
     bundler version) — check the new package's peer dependencies against
     what's installed, not against the latest docs
   - Whether the package has a maintained release compatible with the
     project's module system (ESM vs CJS)
   Do not assume the latest version of a library is safe to add — check
   its peer dependency range against what's already in `package.json`
   first, and prefer the newest version that satisfies existing peers.

## Approved categories (safe to add without escalation)

- Well-known, actively maintained utility libraries for a narrow, common
  problem (date formatting, schema validation, class-name merging)
- Official SDKs for services already integrated in the project (e.g. the
  project's existing database or auth provider's own client)

## Requires justification in the task summary

- Anything that adds a new category of infrastructure (a new database
  client, a new state-management library, a new build tool)
- Anything with low weekly downloads or no commits in the last year
- Anything that duplicates functionality of an existing dependency

## Do not

- Add a dependency to solve a problem solvable in under ~15 lines of
  project code.
- Add a library still in alpha/beta for anything on the critical path.
- Upgrade an existing dependency's major version as a side effect of an
  unrelated task — that's a separate, deliberate task.
- Install without checking peer dependency ranges against the current
  lockfile.
