# Repo
Turborepo monorepo, Bun as package manager (not npm/yarn/pnpm).
Workspaces: apps/backend, apps/frontend, packages/agents,
packages/eslint-config, packages/typescript-config.

# Commands
- Install: bun install
- Dev (all apps): turbo run dev
- Dev (single app): turbo run dev --filter=frontend (or backend)
- Build: turbo run build
- Lint: turbo run lint
- Typecheck: turbo run typecheck
- **DO NOT MAKE ANY COMMITS AT ALL**
# Workspace boundaries
- packages/agents holds the core orchestrator/agent logic
  (BaseAgent, SubAgent, DAG planner, etc). Both backend and frontend
  may depend on it; frontend never reimplements orchestrator types,
  it imports them from packages/agents.
- packages/eslint-config and packages/typescript-config are shared
  configs. Don't fork per-app config unless there's a hard reason —
  ask me before diverging.
- Cross-app changes (e.g. new SSE event type) touch packages/agents
  first as the shared contract, then backend, then frontend.

# Workflow
- Before adding a new dependency to any workspace, check if it
  already exists in another workspace first.
- Don't touch apps/backend from a frontend-focused session unless
  the task explicitly requires it — flag it and ask instead of
  silently crossing the boundary.
- Never edit generated/lockfiles by hand (bun.lock).

# Git
Conventional commits scoped to the workspace touched, e.g.
"frontend: add design variant selector".

# Testing
Do this only when I explictly say about testing, else neglect it.
Read the codebase thoroughly and make a workflow in your context set for that session;
so that you don't hallunicate much. And we'll prefer minimal changes 
not whole revert of the workflow. 