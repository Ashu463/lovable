import { GraphQLError } from "graphql";
import type { GraphQLContext } from "../context";
import { loadOwnedProject } from "../authz";

export const designTypeDefs = `#graphql
  type Design {
    id: ID!
    projectId: ID!
    screenId: String!
    htmlContent: String!
    isSelected: Boolean!
    createdAt: DateTime!
  }

  extend type Project {
    designs: [Design!]!
    "The currently selected design, or null if the user hasn't picked one yet."
    selectedDesign: Design
  }

  extend type Query {
    designs(projectId: ID!): [Design!]!
    selectedDesign(projectId: ID!): Design
  }

  extend type Mutation {
    "Selects a design, clearing the previous selection in the same transaction."
    selectDesign(projectId: ID!, designId: ID!): Design!
    "Legacy path for callers holding htmlContent instead of an id — prefer selectDesign."
    selectDesignByContent(projectId: ID!, htmlContent: String!): Design!
  }
`;

// updateMany + update must land together, or a failure between them leaves the
// project with no selected design at all.
async function applySelection(ctx: GraphQLContext, projectId: string, designId: string) {
  const [, selected] = await ctx.prisma.$transaction([
    ctx.prisma.design.updateMany({ where: { projectId }, data: { isSelected: false } }),
    ctx.prisma.design.update({ where: { id: designId }, data: { isSelected: true } }),
  ]);
  return selected;
}

export const designResolvers = {
  Query: {
    designs: async (
      _parent: unknown,
      args: { projectId: string },
      ctx: GraphQLContext,
    ) => {
      await loadOwnedProject(ctx, args.projectId);
      return ctx.prisma.design.findMany({
        where: { projectId: args.projectId },
        orderBy: { createdAt: "asc" },
      });
    },

    // Nullable rather than the REST 404: "no design picked yet" is a normal
    // state, not an error.
    selectedDesign: async (
      _parent: unknown,
      args: { projectId: string },
      ctx: GraphQLContext,
    ) => {
      await loadOwnedProject(ctx, args.projectId);
      return ctx.prisma.design.findFirst({
        where: { projectId: args.projectId, isSelected: true },
      });
    },
  },

  Mutation: {
    selectDesign: async (
      _parent: unknown,
      args: { projectId: string; designId: string },
      ctx: GraphQLContext,
    ) => {
      await loadOwnedProject(ctx, args.projectId);

      const design = await ctx.prisma.design.findFirst({
        where: { id: args.designId, projectId: args.projectId },
      });
      if (!design) {
        throw new GraphQLError("Design not found", {
          extensions: { code: "NOT_FOUND", http: { status: 404 } },
        });
      }

      return applySelection(ctx, args.projectId, design.id);
    },

    selectDesignByContent: async (
      _parent: unknown,
      args: { projectId: string; htmlContent: string },
      ctx: GraphQLContext,
    ) => {
      await loadOwnedProject(ctx, args.projectId);

      const design = await ctx.prisma.design.findFirst({
        where: { projectId: args.projectId, htmlContent: args.htmlContent },
      });
      if (!design) {
        throw new GraphQLError("Design not found", {
          extensions: { code: "NOT_FOUND", http: { status: 404 } },
        });
      }

      return applySelection(ctx, args.projectId, design.id);
    },
  },

  Project: {
    designs: (parent: { id: string }, _args: unknown, ctx: GraphQLContext) =>
      ctx.prisma.design.findMany({
        where: { projectId: parent.id },
        orderBy: { createdAt: "asc" },
      }),

    selectedDesign: (parent: { id: string }, _args: unknown, ctx: GraphQLContext) =>
      ctx.prisma.design.findFirst({ where: { projectId: parent.id, isSelected: true } }),
  },
};
