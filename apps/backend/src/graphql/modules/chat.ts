import { GraphQLError } from "graphql";
import { randomUUIDv7 } from "bun";
import type { GraphQLContext } from "../context";
import { requireUser } from "../context";
import { loadOwnedProject, loadOwnedRun, loadOwnedRunById } from "../authz";
import { runQueue } from "../../lib/queue";
import { logger } from "../../lib/utils";
import { summarizeIncompleteSession } from "../../../../../packages/agents/agent/utils/priorRunSummary";


export const chatResolvers = {
  Query: {
    runState: async (
      _parent: unknown,
      args: { runId: string },
      ctx: GraphQLContext,
    ) => {
      const run = await loadOwnedRunById(ctx, args.runId);

      // Each status has one event type worth replaying; anything else has no
      // pending UI to restore.
      const eventTypeForStatus: Record<string, string> = {
        CLARIFICATION_NEEDED: "clarification_needed",
        AWAITING_DESIGN_SELECTION: "select_design",
        COMPLETED: "run_completed",
        FAILED: "run_failed",
      };

      let payload: unknown = null;
      const type = eventTypeForStatus[run.status];
      if (type) {
        const event = await ctx.prisma.runEvent.findFirst({
          where: { runId: run.id, type },
          orderBy: { createdAt: "desc" },
        });
        payload = event?.content ? JSON.parse(event.content) : null;
      }

      const paused =
        run.status === "CLARIFICATION_NEEDED" ||
        run.status === "AWAITING_DESIGN_SELECTION";

      // A run only leaves IN_PROGRESS when the agent emits a terminal event, so
      // a worker restart or a job that died mid-flight leaves the row building
      // forever. The queue is the source of truth for whether work is pending:
      // waiting/active/delayed covers every state a job can be in before it
      // reaches the worker, so finding none means nothing will advance this run.
      let stalled = false;
      if (run.status === "IN_PROGRESS") {
        const pending = await runQueue.getJobs(["waiting", "active", "delayed"]);
        stalled = !pending.some((job) => job.data?.runId === run.id);
      }

      const project = await ctx.prisma.project.findUnique({
        where: { id: run.projectId },
        select: { name: true },
      });

      return {
        runId: run.id,
        projectId: run.projectId,
        userPrompt: run.userPrompt,
        projectName: project?.name ?? null,
        status: run.status,
        stalled,
        pauseEvent: paused ? payload : null,
        completedEvent: run.status === "COMPLETED" ? payload : null,
        failedEvent: run.status === "FAILED" ? payload : null,
      };
    },
  },

  Mutation: {
    createRun: async (
      _parent: unknown,
      args: { projectId?: string | null; userPrompt: string; sandboxId?: string | null },
      ctx: GraphQLContext,
    ) => {
      // Identity comes from the verified token — the REST route read it from a
      // client-supplied `userid` header, which any caller could set freely.
      const user = requireUser(ctx);

      if (!args.userPrompt.trim()) {
        throw new GraphQLError("userPrompt must not be empty", {
          extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
        });
      }

      const projectId = args.projectId
        ? (await loadOwnedProject(ctx, args.projectId)).id
        : (
            await ctx.prisma.project.create({
              data: { id: randomUUIDv7(), userId: user.id },
            })
          ).id;

      let sandboxId = args.sandboxId ?? null;
      let priorRunSummary: string | null = null;
      if (args.projectId) {
        const lastRun = await ctx.prisma.run.findFirst({
          where: { projectId, status: "COMPLETED" },
          orderBy: { startedAt: "desc" },
          select: { sandboxId: true, summary: true },
        });
        if (!sandboxId) sandboxId = lastRun?.sandboxId ?? null;
        priorRunSummary = lastRun?.summary ?? null;

        if (!priorRunSummary) {
          const incompleteRun = await ctx.prisma.run.findFirst({
            where: { projectId, status: { in: ["FAILED", "STOPPED", "IN_PROGRESS"] }, sessionSnapshot: { not: null } },
            orderBy: { startedAt: "desc" },
            select: { sessionSnapshot: true },
          });
          if (incompleteRun?.sessionSnapshot) {
            priorRunSummary = await summarizeIncompleteSession(incompleteRun.sessionSnapshot);
          }
        }
      }

      const run = await ctx.prisma.run.create({
        data: {
          id: randomUUIDv7(),
          projectId,
          sandboxId,
          userPrompt: args.userPrompt,
        },
      });

      const owner = await ctx.prisma.user.findUnique({ where: { id: user.id } });
      if (!owner) {
        throw new GraphQLError("User not found", {
          extensions: { code: "NOT_FOUND", http: { status: 404 } },
        });
      }

      try {
        await runQueue.add("run", {
          userId: user.id,
          projectId,
          prompt: args.userPrompt,
          runId: run.id,
          semanticMem: owner.semanticMem,
          sandboxId,
          priorRunSummary,
        });
        logger.info(`Enqueued run ${run.id}`);
      } catch (e) {
        logger.error(`Failed to enqueue run ${run.id}: ${e}`);
        throw new GraphQLError("Failed to start run", {
          extensions: { code: "INTERNAL_SERVER_ERROR", http: { status: 500 } },
        });
      }

      return run;
    },

    continueRun: async (
      _parent: unknown,
      args: {
        projectId: string;
        runId: string;
        answers: { question: string; answer: string }[];
        selectedDesignId?: string | null;
      },
      ctx: GraphQLContext,
    ) => {
      const user = requireUser(ctx);
      const run = await loadOwnedRun(ctx, args.projectId, args.runId);

      if (
        run.status !== "CLARIFICATION_NEEDED" &&
        run.status !== "AWAITING_DESIGN_SELECTION"
      ) {
        throw new GraphQLError(`Run ${run.id} isn't awaiting input`, {
          extensions: { code: "CONFLICT", http: { status: 409 } },
        });
      }

      const owner = await ctx.prisma.user.findUnique({ where: { id: user.id } });
      if (!owner) {
        throw new GraphQLError("User not found", {
          extensions: { code: "NOT_FOUND", http: { status: 404 } },
        });
      }

      const resumed = await ctx.prisma.run.update({
        where: { id: run.id },
        data: { status: "IN_PROGRESS" },
      });

      try {
        await runQueue.add("run", {
          userId: user.id,
          projectId: args.projectId,
          prompt: run.userPrompt,
          runId: run.id,
          semanticMem: owner.semanticMem,
          sandboxId: run.sandboxId,
          answers: args.answers,
          selectedDesignId: args.selectedDesignId ?? null,
        });
        logger.info(`Continuing run ${run.id}`);
      } catch (e) {
        logger.error(`Failed to re-enqueue run ${run.id}: ${e}`);
        // Put the run back where it was so the client can retry, rather than
        // leaving it stuck IN_PROGRESS with nothing working on it.
        await ctx.prisma.run.update({
          where: { id: run.id },
          data: { status: run.status },
        });
        throw new GraphQLError("Failed to continue run", {
          extensions: { code: "INTERNAL_SERVER_ERROR", http: { status: 500 } },
        });
      }

      return resumed;
    },
  },
};
