import type { GraphQLContext } from "../context";
import { loadOwnedProject, loadOwnedRun } from "../authz";

export const runTypeDefs = `#graphql
  enum RunStatus {
    IN_PROGRESS
    CLARIFICATION_NEEDED
    AWAITING_DESIGN_SELECTION
    COMPLETED
    FAILED
    STOPPED
  }

  enum AgentType {
    coder
    debuggerr
    tester
    researcher
    uiExpert
  }

  enum TodoStatus {
    PENDING
    COMPLETED
  }

  type Run {
    id: ID!
    projectId: ID!
    sandboxId: String
    status: RunStatus!
    userPrompt: String!
    currentStep: String
    contextSnapshot: String
    sessionSnapshot: String
    parentRunId: ID
    startedAt: DateTime!
    endedAt: DateTime
    project: Project!
    todos: [Todo!]!
  }

  type Todo {
    id: ID!
    runId: ID!
    taskId: Int!
    task: String!
    agent: AgentType!
    status: TodoStatus!
    "Task ids this one waits on, used by the DAG planner."
    dependency: [Int!]!
    agentSpecificData: JSON
    summary: TaskSummary
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type TaskSummary {
    id: ID!
    summary: String!
    createdAt: DateTime!
    todo: Todo!
  }

  extend type Project {
    runs: [Run!]!
  }

  extend type Query {
    runs(projectId: ID!): [Run!]!
    run(projectId: ID!, runId: ID!): Run!
    todos(projectId: ID!, runId: ID!): [Todo!]!
    "The TaskSummary ledger for a run, in the order the agents produced it."
    summaries(projectId: ID!, runId: ID!): [TaskSummary!]!
  }
`;

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
