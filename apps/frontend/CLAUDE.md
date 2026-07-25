# Stack
Vite + React + TypeScript + Tailwind + shadcn/ui. No CSS-in-JS, no styled-components.
Import shared agent/orchestrator types from packages/agents — don't
redefine them locally.

# Comments
One-line comment per non-obvious block only. Skip comments on
self-evident lines.

# Backend integration
Backend lives at apps/backend. Before building a component that
needs data, check apps/backend's routes/schema for an existing
endpoint. If none exists, stop and tell me the endpoint you need
plus the request/response shape — don't stub or mock silently.

# Real-time
Long-running agent requests render progress via SSE, not polling.
Check for an existing SSE client/hook in this workspace before
writing a new one.

# Design reference
Visual reference for the marketing/landing pages lives in the
uploaded screenshots (dark background, orange/amber gradient accent,
rounded cards). Match spacing and hierarchy from those, not generic
defaults.

# Component structure
[fill in your actual convention — e.g. feature-folder vs atomic;
"good UX" isn't checkable so don't leave this section vague]