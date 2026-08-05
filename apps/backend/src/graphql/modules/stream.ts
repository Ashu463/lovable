import type { GraphQLContext } from "../context";
import { loadOwnedRunById } from "../authz";
import { redis } from "../../lib/redis";
import { logger } from "../../lib/utils";

// Events that mean the orchestrator has returned — nothing further will arrive
// on this run, so the stream closes rather than idling until the client leaves.
const TERMINAL = new Set([
  "run_completed",
  "run_failed",
  "clarification_needed",
  "select_design",
]);

// The pause events are replayed by the runState query instead, so a reconnecting
// client doesn't re-trigger a modal it has already answered.
const NOT_REPLAYED = ["clarification_needed", "select_design"];

export const streamTypeDefs = `#graphql
  type Subscription {
    "Past events for the run, then live ones. Completes when the run reaches a terminal event."
    runEvents(runId: ID!): JSON!
  }
`;

async function* streamRunEvents(run: { id: string; status: string }, ctx: GraphQLContext) {
  // Replay history first so a client joining mid-run (or after a refresh) sees
  // the whole feed, not just what happens from now on.
  const past = await ctx.prisma.runEvent.findMany({
    where: { runId: run.id, type: { notIn: NOT_REPLAYED } },
    orderBy: { createdAt: "asc" },
  });
  for (const event of past) {
    if (event.content) yield { runEvents: JSON.parse(event.content) };
  }

  if (run.status !== "IN_PROGRESS") return;

  // ioredis is callback-based, so messages are buffered here and handed to the
  // generator as it asks for them. Each subscriber needs its own connection: a
  // client in subscribe mode can't run other commands.
  const subscriber = redis.duplicate();
  const pending: string[] = [];
  let notify: (() => void) | null = null;

  const onMessage = (_channel: string, message: string) => {
    pending.push(message);
    notify?.();
    notify = null;
  };

  subscriber.on("message", onMessage);
  subscriber.on("error", (err) =>
    logger.error(`Redis subscriber error for run ${run.id}: ${err}`),
  );
  await subscriber.subscribe(`run:${run.id}`);

  try {
    for (;;) {
      if (pending.length === 0) {
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
      }

      while (pending.length > 0) {
        const raw = pending.shift()!;
        let event: { type?: string };
        try {
          event = JSON.parse(raw);
        } catch (e) {
          logger.error(`Failed to parse event for run ${run.id}: ${e}`);
          continue;
        }

        yield { runEvents: event };

        // Durable status writes happen in sessions.ts; this pub/sub path is only
        // live when a browser is attached, so it just ends the stream rather
        // than being the source of truth.
        if (event.type && TERMINAL.has(event.type)) return;
      }
    }
  } finally {
    // Also runs when the client disconnects and the generator is closed.
    subscriber.off("message", onMessage);
    await subscriber.unsubscribe(`run:${run.id}`).catch(() => {});
    subscriber.disconnect();
  }
}

export const streamResolvers = {
  Subscription: {
    runEvents: {
      // Deliberately not an async generator itself: a generator's body doesn't
      // run until the first pull, so an authorization failure would surface
      // mid-stream as a dropped connection instead of a GraphQL error. Doing
      // the check here keeps rejections on the normal error path.
      subscribe: async (
        _parent: unknown,
        args: { runId: string },
        ctx: GraphQLContext,
      ) => {
        const run = await loadOwnedRunById(ctx, args.runId);
        return streamRunEvents(run, ctx);
      },
    },
  },
};
