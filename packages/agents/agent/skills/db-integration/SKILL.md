---
name: database-integration
description: Client setup, schema conventions, row-level security, and the migration procedure. Use whenever a task touches the database — creating or modifying tables, writing migrations, querying data, or anything involving auth-adjacent data access.
---

# Database Integration

## Before writing any query or migration

- Call the schema-lookup tool to get the actual current table schema —
  never assume a column exists or guess its type from the task description.
- Check version compatibility between the ORM/client version in use and
  the database version before using any newer API surface.

## Migrations

- One logical change per migration. Don't bundle unrelated schema changes.
- Migrations are additive by default — avoid destructive changes (dropping
  columns/tables) unless the task explicitly calls for it, and flag
  destructive migrations in the task summary so they can be reviewed.
- Never hand-edit a previously applied migration — write a new one.

## Row-level security / access rules

- Any new table holding user data gets an explicit access policy — do not
  leave a new table without one and assume it'll be added later.
- Match the access pattern of similar existing tables in the project rather
  than inventing a new permission model per table.

## Queries

- Use the project's existing query/ORM layer consistently — don't mix raw
  SQL and ORM calls for the same kind of operation within one project.
- Avoid N+1 patterns — batch or join instead of looping queries.
- Parameterize all inputs; never interpolate user input into a raw query
  string.

## Do not

- Apply a migration without having read the current schema first.
- Add a column/table without an access policy when the project's existing
  tables all have one.
- Guess at a schema instead of calling the schema tool.
- Make a destructive schema change without flagging it explicitly.