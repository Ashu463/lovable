import type { GraphQLContext } from "../context";
import { loadOwnedProject, loadOwnedRun } from "../authz";


export const runResolvers = {
  Query: {
    runs: async (
      _parent: unknown,
      args: { projectId: string },
      ctx: GraphQLContext,
    ) => {
      await loadOwnedProject(ctx, args.projectId);
      // No `select` here as the REST route had — the client's query decides
      // which fields come back.
      return ctx.prisma.run.findMany({
        where: { projectId: args.projectId },
        orderBy: { startedAt: "desc" },
      });
    },

    run: async (
      _parent: unknown,
      args: { projectId: string; runId: string },
      ctx: GraphQLContext,
    ) => loadOwnedRun(ctx, args.projectId, args.runId),

    todos: async (
      _parent: unknown,
      args: { projectId: string; runId: string },
      ctx: GraphQLContext,
    ) => {
      const run = await loadOwnedRun(ctx, args.projectId, args.runId);
      return ctx.prisma.todo.findMany({
        where: { runId: run.id },
        orderBy: { taskId: "asc" },
      });
    },

    summaries: async (
      _parent: unknown,
      args: { projectId: string; runId: string },
      ctx: GraphQLContext,
    ) => {
      const run = await loadOwnedRun(ctx, args.projectId, args.runId);
      return ctx.prisma.taskSummary.findMany({
        where: { todo: { runId: run.id } },
        orderBy: { createdAt: "asc" },
      });
    },
  },

  // Nested fields are only hit when a query actually selects them, so the extra
  // round trips are opt-in. Worth a DataLoader once list queries start selecting
  // them heavily.
  Project: {
    runs: (parent: { id: string }, _args: unknown, ctx: GraphQLContext) =>
      ctx.prisma.run.findMany({
        where: { projectId: parent.id },
        orderBy: { startedAt: "desc" },
      }),
  },


  

  Run: {
    project: (parent: { projectId: string }, _args: unknown, ctx: GraphQLContext) =>
      ctx.prisma.project.findUnique({ where: { id: parent.projectId } }),

    todos: (parent: { id: string }, _args: unknown, ctx: GraphQLContext) =>
      ctx.prisma.todo.findMany({
        where: { runId: parent.id },
        orderBy: { taskId: "asc" },
      }),
  },

  Todo: {
    summary: (parent: { id: string }, _args: unknown, ctx: GraphQLContext) =>
      ctx.prisma.taskSummary.findUnique({ where: { todoId: parent.id } }),
  },

  TaskSummary: {
    todo: (parent: { todoId: string }, _args: unknown, ctx: GraphQLContext) =>
      ctx.prisma.todo.findUnique({ where: { id: parent.todoId } }),
  },
};
