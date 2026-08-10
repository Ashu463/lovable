import { randomUUIDv7 } from "bun";
import type { GraphQLContext } from "../context";
import { requireInternal } from "../authz";
import { logger } from "../../lib/utils";

// Statuses the run moves to when the orchestrator emits a terminal event. This
// is the authoritative write — the redis pub/sub path only fires when a browser
// happens to be connected.
const STATUS_FOR_EVENT: Record<string, "CLARIFICATION_NEEDED" | "AWAITING_DESIGN_SELECTION" | "COMPLETED" | "FAILED"> = {
  clarification_needed: "CLARIFICATION_NEEDED",
  select_design: "AWAITING_DESIGN_SELECTION",
  run_completed: "COMPLETED",
  run_failed: "FAILED",
};


export const internalResolvers = {
  Mutation: {
    saveDesigns: async (
      _parent: unknown,
      args: { projectId: string; designs: string[] },
      ctx: GraphQLContext,
    ) => {
      requireInternal(ctx);

      return ctx.prisma.$transaction(
        args.designs.map((htmlContent) =>
          ctx.prisma.design.create({
            data: {
              id: randomUUIDv7(),
              projectId: args.projectId,
              screenId: "",
              htmlContent,
              createdAt: new Date(),
            },
          }),
        ),
      );
    },

    saveQuestions: async (
      _parent: unknown,
      args: {
        projectId: string;
        runId: string;
        questions: { question: string; option: string[] }[];
      },
      ctx: GraphQLContext,
    ) => {
      requireInternal(ctx);

      return ctx.prisma.$transaction(
        args.questions.map((q) =>
          ctx.prisma.question.create({
            data: {
              id: randomUUIDv7(),
              runId: args.runId,
              projectId: args.projectId,
              question: q.question,
              options: q.option,
              createdAt: new Date(),
            },
          }),
        ),
      );
    },

    saveTodos: async (
      _parent: unknown,
      args: {
        projectId: string;
        runId: string;
        todos: {
          id: number;
          task: string;
          agent: string;
          status: string;
          dependency: number[];
          designNeeded?: boolean | null;
        }[];
      },
      ctx: GraphQLContext,
    ) => {
      requireInternal(ctx);

      return ctx.prisma.$transaction(
        args.todos.map((t) =>
          ctx.prisma.todo.create({
            data: {
              id: randomUUIDv7(),
              runId: args.runId,
              taskId: t.id,
              task: t.task,
              agent: t.agent as never,
              status: t.status === "completed" ? "COMPLETED" : "PENDING",
              dependency: t.dependency,
              agentSpecificData:
                t.designNeeded !== undefined && t.designNeeded !== null
                  ? { designNeeded: t.designNeeded }
                  : undefined,
            },
          }),
        ),
      );
    },

    saveTaskSummary: async (
      _parent: unknown,
      args: { projectId: string; runId: string; taskId: number; summary: string },
      ctx: GraphQLContext,
    ) => {
      requireInternal(ctx);

      const todo = await ctx.prisma.todo.findFirst({
        where: { runId: args.runId, taskId: args.taskId },
      });
      if (!todo) {
        throw new Error(`Todo ${args.taskId} not found for run ${args.runId}`);
      }

      const [, saved] = await ctx.prisma.$transaction([
        ctx.prisma.todo.update({ where: { id: todo.id }, data: { status: "COMPLETED" } }),
        ctx.prisma.taskSummary.upsert({
          where: { todoId: todo.id },
          create: { id: randomUUIDv7(), todoId: todo.id, summary: args.summary },
          update: { summary: args.summary },
        }),
      ]);
      return saved;
    },

    recordRunEvent: async (
      _parent: unknown,
      args: { runId: string; event: { type?: string } },
      ctx: GraphQLContext,
    ) => {
      requireInternal(ctx);

      await ctx.prisma.runEvent.create({
        data: {
          id: randomUUIDv7(),
          runId: args.runId,
          type: args.event.type ?? "unknown",
          content: JSON.stringify(args.event),
          createdAt: new Date(),
        },
      });

      const status = args.event.type ? STATUS_FOR_EVENT[args.event.type] : undefined;
      if (status) {
        await ctx.prisma.run.update({
          where: { id: args.runId },
          data: { status, endedAt: new Date() },
        });
      }

      return true;
    },

    saveRunState: async (
      _parent: unknown,
      args: {
        runId: string;
        contextSnapshot?: string | null;
        sessionSnapshot?: string | null;
        iteration?: number | null;
      },
      ctx: GraphQLContext,
    ) => {
      requireInternal(ctx);

      try {
        // Snapshots arrive already JSON.stringify'd — re-encoding here would
        // double-escape whatever the caller sent.
        await ctx.prisma.run.update({
          where: { id: args.runId },
          data: {
            contextSnapshot: args.contextSnapshot ?? undefined,
            sessionSnapshot: args.sessionSnapshot ?? undefined,
            currentStep:
              args.iteration !== undefined && args.iteration !== null
                ? String(args.iteration)
                : undefined,
          },
        });
        return true;
      } catch (e) {
        logger.error(`Failed to save session state for run ${args.runId}: ${e}`);
        return false;
      }
    },

    saveRunSummary: async (
      _parent: unknown,
      args: { runId: string; summary: string },
      ctx: GraphQLContext,
    ) => {
      requireInternal(ctx);

      try {
        await ctx.prisma.run.update({
          where: { id: args.runId },
          data: { summary: args.summary },
        });
        return true;
      } catch (e) {
        logger.error(`Failed to save summary for run ${args.runId}: ${e}`);
        return false;
      }
    },

    nameProjectIfUnnamed: async (
      _parent: unknown,
      args: { projectId: string; name: string },
      ctx: GraphQLContext,
    ) => {
      requireInternal(ctx);

      try {
        // updateMany with a name: null filter makes this a no-op once the
        // project is named — the first run wins and follow-ups can't rename it.
        const { count } = await ctx.prisma.project.updateMany({
          where: { id: args.projectId, name: null },
          data: { name: args.name },
        });
        return count > 0;
      } catch (e) {
        logger.error(`Failed to name project ${args.projectId}: ${e}`);
        return false;
      }
    },
  },
};
