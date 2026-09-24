FROM oven/bun:1

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile

# `prisma generate` only reads the schema, it doesn't connect — but prisma.config.ts
# resolves DATABASE_URL eagerly and errors if it's unset. Render injects the real
# value as a runtime env var, which overrides this at container start.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN cd apps/backend && bunx prisma generate

WORKDIR /app/apps/backend

# Render's Docker services let you override this per-service — the worker
# service sets its command to `bun run src/lib/worker.ts` instead.
CMD ["bun", "run", "src/index.ts"]
