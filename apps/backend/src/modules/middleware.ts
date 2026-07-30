import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
  // Set for trusted service-to-service calls (agent worker), which have no
  // end user in context and therefore skip per-user ownership checks.
  isInternal?: boolean;
}

function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

function isInternalToken(token: string): boolean {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expected) {
    return false;
  }
  return constantTimeEquals(token, expected);
}

function bearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return undefined;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : undefined;
}

export function auth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  // The agent worker calls these same /api/* routes as a trusted system
  // caller (no end user in context) — a shared secret instead of a JWT.
  if (isInternalToken(token)) {
    req.isInternal = true;
    return next();
  }

  try {
    const payload = jwt.verify(
      token,
      requireJwtSecret()
    ) as {
      id: string;
      email: string;
    };

    req.user = payload;

    next();
  } catch {
    return res.status(401).json({
      message: "Invalid token",
    });
  }
}

// For service-to-service calls from the agent worker (session state/event
// persistence) — a shared secret, not a user JWT.
export function internalAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const token = bearerToken(req);

  if (!token || !isInternalToken(token)) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  req.isInternal = true;
  next();
}

export function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return secret;
}

// Fail fast on boot rather than silently serving an unauthenticatable API
// (missing JWT_SECRET) or one whose internal routes can never be reached.
export function assertAuthConfig() {
  const missing = ["JWT_SECRET", "INTERNAL_SERVICE_TOKEN"].filter(
    (key) => !process.env[key],
  );
  if (missing.length > 0) {
    throw new Error(`Missing required auth env vars: ${missing.join(", ")}`);
  }
}
