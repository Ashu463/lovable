import jwt from "jsonwebtoken";
import { GraphQLError } from "graphql";
import { prisma } from "../lib/prisma";

export interface GraphQLContext {
  prisma: typeof prisma;
  // Null for anonymous callers (signup/login) and for internal service calls,
  // which authenticate as the system rather than as an end user.
  user: { id: string; email: string } | null;
  isInternal: boolean;
}

// Takes just the headers rather than a full express Request, so the Apollo
// middleware and the graphql-sse handler can both build a context from it.
export async function createContext({
  req,
}: {
  req: { headers: Record<string, string | string[] | undefined> };
}): Promise<GraphQLContext> {
  const raw = req.headers.authorization;
  const authHeader = Array.isArray(raw) ? raw[0] : raw;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined;

  if (!token) {
    return { prisma, user: null, isInternal: false };
  }

  // Same shared-secret escape hatch the REST `auth` middleware uses, so the
  // agent worker can call as a trusted system caller with no end user.
  if (token === process.env.INTERNAL_SERVICE_TOKEN) {
    return { prisma, user: null, isInternal: true };
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
      email: string;
    };
    return { prisma, user: { id: payload.id, email: payload.email }, isInternal: false };
  } catch {
    // An invalid token is left to `requireUser` to reject, so that public
    // operations still resolve when a stale token happens to be attached.
    return { prisma, user: null, isInternal: false };
  }
}

export function requireUser(ctx: GraphQLContext): { id: string; email: string } {
  if (!ctx.user) {
    throw new GraphQLError("Unauthorized", {
      extensions: { code: "UNAUTHENTICATED", http: { status: 401 } },
    });
  }
  return ctx.user;
}
