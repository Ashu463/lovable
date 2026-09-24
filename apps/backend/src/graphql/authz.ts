import { GraphQLError } from "graphql";
import type { GraphQLContext } from "./context";
import { requireUser } from "./context";

// Temporary demo gate (matches the frontend's ADMIN_EMAIL): any logged-in
// account may read the admin's projects, but this never loosens a mutation
// path — only the two read-only resolvers below use it.
const ADMIN_EMAIL = "ashukasaudhan971@gmail.com";

// Every project-scoped resolver funnels through this, so ownership is enforced
// in one place rather than re-derived per field. Internal service callers (the
// agent worker) have no end user, so they bypass the ownership check the same
// way the REST `auth` middleware let them through.
export async function loadOwnedProject(ctx: GraphQLContext, projectId: string) {
  if (!ctx.isInternal) requireUser(ctx);

  const project = await ctx.prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new GraphQLError("Project not found", {
      extensions: { code: "NOT_FOUND", http: { status: 404 } },
    });
  }

  if (!ctx.isInternal && project.userId !== ctx.user!.id) {
    throw new GraphQLError("Not your project", {
      extensions: { code: "FORBIDDEN", http: { status: 403 } },
    });
  }

  return project;
}

// Same ownership rule as above, but also lets any authenticated caller read
// (never write) the admin's own projects — used only by Query/Subscription
// resolvers, never by a mutation.
export async function loadViewableProject(ctx: GraphQLContext, projectId: string) {
  if (!ctx.isInternal) requireUser(ctx);

  const project = await ctx.prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new GraphQLError("Project not found", {
      extensions: { code: "NOT_FOUND", http: { status: 404 } },
    });
  }

  if (ctx.isInternal || project.userId === ctx.user!.id) return project;

  const admin = await ctx.prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (admin?.id === project.userId) return project;

  throw new GraphQLError("Not your project", {
    extensions: { code: "FORBIDDEN", http: { status: 403 } },
  });
}

// Same as above but for run-scoped fields: proves the run belongs to a project
// the caller owns, which the REST routes never actually checked.
export async function loadOwnedRun(
  ctx: GraphQLContext,
  projectId: string,
  runId: string,
) {
  await loadOwnedProject(ctx, projectId);

  const run = await ctx.prisma.run.findFirst({ where: { id: runId, projectId } });
  if (!run) {
    throw new GraphQLError("Run not found", {
      extensions: { code: "NOT_FOUND", http: { status: 404 } },
    });
  }

  return run;
}

// Read-only counterpart to loadOwnedRun — same run lookup, but reaches it
// through loadViewableProject so any caller can view the admin's runs.
export async function loadViewableRun(
  ctx: GraphQLContext,
  projectId: string,
  runId: string,
) {
  await loadViewableProject(ctx, projectId);

  const run = await ctx.prisma.run.findFirst({ where: { id: runId, projectId } });
  if (!run) {
    throw new GraphQLError("Run not found", {
      extensions: { code: "NOT_FOUND", http: { status: 404 } },
    });
  }

  return run;
}

// Guards the mutations only the agent worker may call. These carry no end user,
// so they authenticate with the shared INTERNAL_SERVICE_TOKEN instead of a JWT.
export function requireInternal(ctx: GraphQLContext) {
  if (!ctx.isInternal) {
    throw new GraphQLError("Internal service token required", {
      extensions: { code: "FORBIDDEN", http: { status: 403 } },
    });
  }
}

// For the routes keyed on runId alone (a reloaded /w/:runId page has no project
// id to hand back), so ownership has to be reached through the run's project.
export async function loadOwnedRunById(ctx: GraphQLContext, runId: string) {
  const run = await ctx.prisma.run.findUnique({ where: { id: runId } });
  if (!run) {
    throw new GraphQLError("Run not found", {
      extensions: { code: "NOT_FOUND", http: { status: 404 } },
    });
  }

  await loadOwnedProject(ctx, run.projectId);
  return run;
}

// Read-only counterpart to loadOwnedRunById — used by the runState query and
// the runEvents subscription so any caller can watch the admin's builds.
export async function loadViewableRunById(ctx: GraphQLContext, runId: string) {
  const run = await ctx.prisma.run.findUnique({ where: { id: runId } });
  if (!run) {
    throw new GraphQLError("Run not found", {
      extensions: { code: "NOT_FOUND", http: { status: 404 } },
    });
  }

  await loadViewableProject(ctx, run.projectId);
  return run;
}
