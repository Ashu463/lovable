import type { Response } from "express";
import { prisma } from "../prisma";
import type { AuthRequest } from "./middleware";

// Ownership checks live here rather than being repeated per route so every
// project/run-scoped handler enforces the same rule: internal (worker) callers
// act on behalf of the system and pass, everyone else must own the project.
//
// Both helpers write the error response and return false when access is denied,
// so callers only need `if (!(await authorizeProject(...))) return`.

export async function authorizeProject(
  req: AuthRequest,
  res: Response,
  projectId: string,
): Promise<boolean> {
  if (req.isInternal) {
    return true;
  }

  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return false;
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });

  if (!project) {
    res.status(404).json({ success: false, message: "Project not found" });
    return false;
  }
  if (project.userId !== userId) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return false;
  }

  return true;
}

export async function authorizeRun(
  req: AuthRequest,
  res: Response,
  runId: string,
): Promise<boolean> {
  if (req.isInternal) {
    return true;
  }

  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return false;
  }

  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: { project: { select: { userId: true } } },
  });

  if (!run) {
    res.status(404).json({ success: false, message: "Run not found" });
    return false;
  }
  if (run.project.userId !== userId) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return false;
  }

  return true;
}

// Routes that create resources for the caller need a real user, never the
// worker's shared secret.
export function requireUserId(req: AuthRequest, res: Response): string | null {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return null;
  }
  return userId;
}
