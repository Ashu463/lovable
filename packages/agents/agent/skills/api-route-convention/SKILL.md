---
name: api-route-conventions
description: Error shape, status codes, and the streaming/SSE pattern for backend routes. Use whenever writing or editing an API or server route.
---

# API Route Conventions

## Error responses

Use a consistent error shape across every route:

```json
{ "error": { "message": "<human readable>", "code": "<machine readable>" } }
```

Never return a bare string, a stack trace, or an inconsistent shape from
one route to another.

## Status codes

- 200 — success
- 201 — resource created
- 400 — invalid input (validation failure)
- 401 — not authenticated
- 403 — authenticated but not authorized
- 404 — resource not found
- 500 — unexpected server error (should be rare; most failures should be
  caught and mapped to a specific 4xx)

## Streaming / SSE

Follow the project's existing SSE pattern exactly if one exists — do not
introduce a second streaming mechanism. If none exists yet and the task
requires one, keep the event backend-owned and stream through the existing
relay path rather than having the client connect directly to any sandboxed
process.

## Validation

Validate and parse all inputs at the top of the route handler before any
business logic runs. Don't validate halfway through.

## Do not

- Return different error shapes from different routes.
- Use 200 with an `error` field in the body instead of an actual error
  status code.
- Let an unhandled exception fall through to a generic 500 without at least
  logging enough to debug it later.
- Introduce a second streaming mechanism alongside an existing SSE setup.