import { Router } from "express";
import { prisma } from "../prisma";
import { auth } from "./middleware";
import type { Request, Response } from "express";

const runRouter = Router();
/*
Routes:
GET    /projects/:projectId/runs                  → list runs for a project (id, status, startedAt/endedAt)
GET    /projects/:projectId/runs/:runId           → single run detail
GET    /projects/:projectId/runs/:runId/todos     → Todo rows + their TaskSummary for that run
GET    /projects/:projectId/runs/:runId/summaries → just the TaskSummary ledger (priorSummaries) for that run

*/

runRouter.get("/:projectId/runs", auth, async (req: Request, res: Response) => {
    const projectId = req.params.projectId;

    if (typeof projectId !== "string") {
        return res.status(400).json({
            success: false,
            message: "Invalid projectId",
        });
    }

    try {
        const runs = await prisma.run.findMany({
            where: {
                projectId: projectId,
            },
            select: {
                id: true,
                status: true,
                startedAt: true,
                endedAt: true,
            },
            orderBy: {
                startedAt: "desc",
            },
        });

        return res.status(200).json({
            success: true,
            data: runs,
        });
    } catch (e) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});


runRouter.get("/:projectId/runs/:runId", auth, async (req: Request, res: Response) => {
    const { projectId, runId } = req.params;

    if (
        typeof projectId !== "string" ||
        typeof runId !== "string"
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid params",
        });
    }

    try {
        const run = await prisma.run.findFirst({
            where: {
                id: runId,
                projectId: projectId,
            },
        });

        if (!run) {
            return res.status(404).json({
                success: false,
                message: "Run not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: run,
        });
    } catch (e) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});


runRouter.get("/:projectId/runs/:runId/todos", auth, async (req: Request, res: Response) => {
    const { projectId, runId } = req.params;

    if (
        typeof projectId !== "string" ||
        typeof runId !== "string"
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid params",
        });
    }

    try {
        const run = await prisma.run.findFirst({
            where: {
                id: runId,
                projectId: projectId,
            },
        });

        if (!run) {
            return res.status(404).json({
                success: false,
                message: "Run not found",
            });
        }

        const todos = await prisma.todo.findMany({
            where: {
                runId: runId,
            },
            include: {
                summary: true,
            },
            orderBy: {
                taskId: "asc",
            },
        });

        return res.status(200).json({
            success: true,
            data: todos,
        });
    } catch (e) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});


runRouter.get("/:projectId/runs/:runId/summaries", auth, async (req: Request, res: Response) => {
    const { projectId, runId } = req.params;

    if (
        typeof projectId !== "string" ||
        typeof runId !== "string"
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid params",
        });
    }

    try {
        const run = await prisma.run.findFirst({
            where: {
                id: runId,
                projectId: projectId,
            },
        });

        if (!run) {
            return res.status(404).json({
                success: false,
                message: "Run not found",
            });
        }

        const summaries = await prisma.taskSummary.findMany({
            where: {
                todo: {
                    runId: runId,
                },
            },
            include: {
                todo: {
                    select: {
                        taskId: true,
                        task: true,
                        agent: true,
                        status: true,
                    },
                },
            },
            orderBy: {
                createdAt: "asc",
            },
        });

        return res.status(200).json({
            success: true,
            data: summaries,
        });
    } catch (e) {
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

export default runRouter;