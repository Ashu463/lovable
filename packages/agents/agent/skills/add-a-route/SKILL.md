---
name: add-a-route
description: Full checklist and conventions for adding a new page or route. Use whenever a task involves creating a new page, screen, or user-reachable endpoint — not for editing an existing route.
---

# Add a Route

## Steps (all required, in order)

1. Create the route file following `project-conventions` naming/location.
2. Register the route in the router configuration.
3. If the route is user-reachable (not an internal/API-only route), add the
   nav entry linking to it.
4. Add loading and error states for any data the route fetches — never ship
   a route that can render a bare unhandled fetch or a blank screen on error.
5. If the route requires auth, apply the project's existing auth-guard
   pattern rather than inventing a new one.
6. Run the checklist in `smoke-checklist` before reporting done.

## Conventions

- Route components live in `src/pages/`, one file per route.
- Route-level data fetching happens in the route component, not buried in
  a deeply nested child.
- Dynamic route params are typed, not accessed as untyped strings.

## Do not

- Register a route without a corresponding nav entry when it's meant to be
  user-reachable — this is the single most common incomplete-route failure.
- Duplicate an existing route's path.
- Fetch data with no loading/error handling "because it'll usually work."