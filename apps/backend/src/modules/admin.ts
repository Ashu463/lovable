import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";

// The dashboard is browser-facing, so it uses HTTP basic auth (the browser can
// prompt for it) rather than the worker's bearer token.
export function isAdminDashboardEnabled(): boolean {
  return Boolean(process.env.ADMIN_DASHBOARD_USER && process.env.ADMIN_DASHBOARD_PASSWORD);
}

function safeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

export function adminDashboardAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const expectedUser = process.env.ADMIN_DASHBOARD_USER;
  const expectedPassword = process.env.ADMIN_DASHBOARD_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return res.status(404).end();
  }

  if (header?.startsWith("Basic ")) {
    const [user, ...passwordParts] = Buffer.from(header.slice("Basic ".length), "base64")
      .toString("utf8")
      .split(":");
    const password = passwordParts.join(":");
    if (user && safeEquals(user, expectedUser) && safeEquals(password, expectedPassword)) {
      return next();
    }
  }

  res.setHeader("WWW-Authenticate", 'Basic realm="queues"');
  return res.status(401).json({ message: "Unauthorized" });
}
