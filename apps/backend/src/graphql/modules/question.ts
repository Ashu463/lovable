import { GraphQLError } from "graphql";
import { randomUUIDv7 } from "bun";
import type { GraphQLContext } from "../context";
import { loadOwnedProject, loadOwnedRun } from "../authz";


export const questionResolvers = {
  Query: {
    questions: async (
      _parent: unknown,
      args: { projectId: string },
      ctx: GraphQLContext,
    ) => {
      await loadOwnedProject(ctx, args.projectId);
      return ctx.prisma.question.findMany({
        where: { projectId: args.projectId, clarification: null },
        orderBy: { createdAt: "asc" },
      });
    },
  },

  Mutation: {
    answerQuestions: async (
      _parent: unknown,
      args: {
        projectId: string;
        runId: string;
        answers: { questionId: string; answer: string }[];
      },
      ctx: GraphQLContext,
    ) => {
      await loadOwnedRun(ctx, args.projectId, args.runId);

      if (args.answers.length === 0) {
        throw new GraphQLError("answers must be a non-empty array", {
          extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
        });
      }

      // Validated up front so a bad id fails the whole mutation instead of
      // leaving some answers written and others not.
      const questions = await ctx.prisma.question.findMany({
        where: {
          id: { in: args.answers.map((a) => a.questionId) },
          projectId: args.projectId,
        },
      });

      const byId = new Map(questions.map((q) => [q.id, q]));
      const missing = args.answers.find((a) => !byId.has(a.questionId));
      if (missing) {
        throw new GraphQLError(
          `Question ${missing.questionId} not found for project ${args.projectId}`,
          { extensions: { code: "NOT_FOUND", http: { status: 404 } } },
        );
      }

      return ctx.prisma.$transaction(
        args.answers.map(({ questionId, answer }) =>
          ctx.prisma.answers.upsert({
            where: { questionId },
            create: {
              id: randomUUIDv7(),
              runId: args.runId,
              questionId,
              questionText: byId.get(questionId)!.question,
              answer,
              answeredAt: new Date(),
            },
            update: { answer, answeredAt: new Date() },
          }),
        ),
      );
    },
  },

  Question: {
    clarification: (parent: { id: string }, _args: unknown, ctx: GraphQLContext) =>
      ctx.prisma.answers.findUnique({ where: { questionId: parent.id } }),
  },

  Project: {
    questions: (parent: { id: string }, _args: unknown, ctx: GraphQLContext) =>
      ctx.prisma.question.findMany({
        where: { projectId: parent.id },
        orderBy: { createdAt: "asc" },
      }),
  },
};
