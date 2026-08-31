import { GraphQLError } from "graphql";
import { randomUUIDv7 } from "bun";
import type { GraphQLContext } from "../context";
import { loadOwnedProject, loadOwnedRun } from "../authz";

export const uiPreferenceResolvers = {
  Query: {
    uiPreferenceQuestions: async (
      _parent: unknown,
      args: { projectId: string },
      ctx: GraphQLContext,
    ) => {
      await loadOwnedProject(ctx, args.projectId);
      return ctx.prisma.uIPreferenceQuestion.findMany({
        where: { projectId: args.projectId, answer: null },
        orderBy: { createdAt: "asc" },
      });
    },

    currentUIPreferences: async (
      _parent: unknown,
      args: { projectId: string },
      ctx: GraphQLContext,
    ) => {
      await loadOwnedProject(ctx, args.projectId);
      // Every answered preference, not just the latest — they're separate
      // facets (palette, mood, density), so they all stay in effect.
      return ctx.prisma.uIPreferenceAnswer.findMany({
        where: { projectId: args.projectId },
        orderBy: { answeredAt: "asc" },
      });
    },
  },

  Mutation: {
    answerUIPreference: async (
      _parent: unknown,
      args: { projectId: string; runId: string; questionId: string; answer: string },
      ctx: GraphQLContext,
    ) => {
      await loadOwnedRun(ctx, args.projectId, args.runId);

      const question = await ctx.prisma.uIPreferenceQuestion.findFirst({
        where: { id: args.questionId, projectId: args.projectId },
      });
      if (!question) {
        throw new GraphQLError(`UI preference question ${args.questionId} not found for project ${args.projectId}`, {
          extensions: { code: "NOT_FOUND", http: { status: 404 } },
        });
      }

      return ctx.prisma.uIPreferenceAnswer.upsert({
        where: { questionId: args.questionId },
        create: {
          id: randomUUIDv7(),
          projectId: args.projectId,
          questionId: args.questionId,
          questionText: question.question,
          answer: args.answer,
          answeredAt: new Date(),
        },
        update: { answer: args.answer, answeredAt: new Date() },
      });
    },
  },

  UIPreferenceQuestion: {
    answer: (parent: { id: string }, _args: unknown, ctx: GraphQLContext) =>
      ctx.prisma.uIPreferenceAnswer.findUnique({ where: { questionId: parent.id } }),
  },
};
