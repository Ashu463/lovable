import { GraphQLError } from "graphql";
import { randomUUID } from "node:crypto";
import type { GraphQLContext } from "../context";
import { requireUser } from "../context";
import { loadOwnedProject } from "../authz";
import { R2 } from "../../../../../packages/agents/agent/services/file-storage/fileStorage";
import { E2BSandbox } from "../../../../../packages/agents/agent/utils/sandbox";
import { logger } from "../../lib/utils";

const r2 = new R2();


export const projectResolvers = {
  // Both fields hit the runs table per project, so a long list costs one query
  // each — worth a DataLoader if these lists ever grow past a page.
  Project: {
    title: async (parent: { id: string; name: string | null }, _args: unknown, ctx: GraphQLContext) => {
      if (parent.name?.trim()) return parent.name;

      // Projects created by createRun have no name, so fall back to the prompt
      // that started the session.
      const first = await ctx.prisma.run.findFirst({
        where: { projectId: parent.id },
        orderBy: { startedAt: "asc" },
        select: { userPrompt: true },
      });
      return first?.userPrompt?.trim() || "Untitled project";
    },

    latestRunId: async (parent: { id: string }, _args: unknown, ctx: GraphQLContext) => {
      const latest = await ctx.prisma.run.findFirst({
        where: { projectId: parent.id },
        orderBy: { startedAt: "desc" },
        select: { id: true },
      });
      return latest?.id ?? null;
    },
  },

  Query: {
    projects: async (_parent: unknown, _args: unknown, ctx: GraphQLContext) => {
      const user = requireUser(ctx);
      return ctx.prisma.project.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
      });
    },

    project: async (_parent: unknown, args: { id: string }, ctx: GraphQLContext) =>
      loadOwnedProject(ctx, args.id),

    projectSession: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext,
    ) => {
      const project = await loadOwnedProject(ctx, args.id);

      const latestRun = await ctx.prisma.run.findFirst({
        where: { projectId: project.id },
        orderBy: { startedAt: "desc" },
      });

      let previewUrl: string | null = null;
      let sandboxId: string | null = latestRun?.sandboxId ?? null;

      try {
        const sandbox = await E2BSandbox.StartSandbox(
          project.userId,
          project.id,
          latestRun?.sandboxId ?? undefined,
        );
        sandboxId = sandbox.sandboxId;
        previewUrl = await sandbox.GetPreviewUrl();

        if (latestRun && sandbox.sandboxId !== latestRun.sandboxId) {
          await ctx.prisma.run.update({
            where: { id: latestRun.id },
            data: { sandboxId: sandbox.sandboxId },
          });
        }

        // Keep the stored run_completed event in sync so the run state the
        // workspace reads on load hands back the refreshed URL, not a dead one.
        if (latestRun?.status === "COMPLETED") {
          const event = await ctx.prisma.runEvent.findFirst({
            where: { runId: latestRun.id, type: "run_completed" },
            orderBy: { createdAt: "desc" },
          });
          if (event?.content) {
            const parsed = JSON.parse(event.content);
            if (parsed?.result) {
              parsed.result.previewUrl = previewUrl;
              await ctx.prisma.runEvent.update({
                where: { id: event.id },
                data: { content: JSON.stringify(parsed) },
              });
            }
          }
        }
      } catch (e) {
        // A dead sandbox shouldn't fail the whole query — the project metadata
        // is still useful, so previewUrl just comes back null.
        logger.error(`Failed to open sandbox for project ${project.id}: ${e}`);
      }

      return { project, latestRunId: latestRun?.id ?? null, sandboxId, previewUrl };
    },

    projectFiles: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext,
    ) => {
      const project = await loadOwnedProject(ctx, args.id);

      const prefix = r2.filesPrefix(project.userId, project.id);
      const keys = await r2.listFiles(prefix);

      // Batched so a large project doesn't open hundreds of R2 reads at once.
      const files: { path: string; content: string }[] = [];
      for (let i = 0; i < keys.length; i += 10) {
        const batch = keys.slice(i, i + 10);
        files.push(
          ...(await Promise.all(
            batch.map(async (key) => ({
              path: key.replace(prefix, ""),
              content: await r2.getFile(key),
            })),
          )),
        );
      }
      return files;
    },
  },

  Mutation: {
    createProject: async (
      _parent: unknown,
      args: { name?: string | null },
      ctx: GraphQLContext,
    ) => {
      // Owner comes from the verified token, never from client input.
      const user = requireUser(ctx);

      return ctx.prisma.project.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          name: typeof args.name === "string" ? args.name : null,
        },
      });
    },

    updateProject: async (
      _parent: unknown,
      args: {
        id: string;
        name?: string | null;
        archived?: boolean | null;
        starred?: boolean | null;
        isComplex?: boolean | null;
      },
      ctx: GraphQLContext,
    ) => {
      const project = await loadOwnedProject(ctx, args.id);

      // Only fields actually supplied are written, so omitting one leaves it
      // alone rather than nulling it.
      const data: {
        name?: string;
        isArchived?: boolean;
        isStarred?: boolean;
        isComplex?: boolean;
      } = {};
      if (args.name != null) data.name = args.name;
      if (args.archived != null) data.isArchived = args.archived;
      if (args.starred != null) data.isStarred = args.starred;
      if (args.isComplex != null) data.isComplex = args.isComplex;

      if (Object.keys(data).length === 0) {
        throw new GraphQLError("No fields to update", {
          extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
        });
      }

      return ctx.prisma.project.update({ where: { id: project.id }, data });
    },

    deleteProject: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext,
    ) => {
      const project = await loadOwnedProject(ctx, args.id);
      await ctx.prisma.project.delete({ where: { id: project.id } });
      return true;
    },
  },
};
