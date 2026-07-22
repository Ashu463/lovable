import { Router } from "express";
import { prisma } from "../prisma";
import { auth, internalAuth } from "./middleware";
import type { Request, Response } from "express";
import { randomUUIDv7 } from "bun";
import { logger } from "./utils";
import type { AgentType } from "../../generated/prisma/enums";

const runRouter = Router();
/*
Routes:
GET    /projects/:projectId/runs                        → list runs for a project (id, status, startedAt/endedAt)
GET    /projects/:projectId/runs/:runId                  → single run detail
GET    /projects/:projectId/runs/:runId/todos            → Todo rows + their TaskSummary for that run
GET    /projects/:projectId/runs/:runId/summaries        → just the TaskSummary ledger (priorSummaries) for that run
POST   /projects/:projectId/:runId/todos                 → create the planner's Todo rows for a run
POST   /projects/:projectId/:runId/todos/:taskId/summary → mark a Todo completed + upsert its TaskSummary

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


runRouter.get("/:projectId/:runId/todos", auth, async (req: Request, res: Response) => {
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


runRouter.get("/:projectId/:runId/summaries", auth, async (req: Request, res: Response) => {
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


runRouter.post("/:projectId/:runId/todos", internalAuth, async (req: Request, res: Response) => {
    const { projectId, runId } = req.params;
    const { todos } = req.body as {
        todos: {id: number, task: string, agent: AgentType, status: "pending" | "completed", dependency: number[], designNeeded?: boolean}[]
    };

    if (typeof projectId !== "string" || typeof runId !== "string") {
        return res.status(400).json({
            success: false,
            message: "Invalid params",
        });
    }
    if (!Array.isArray(todos) || todos.length === 0) {
        return res.status(400).json({
            success: false,
            message: "todos must be a non-empty array",
        });
    }

    try {
        const created = await Promise.all(todos.map((t) =>
            prisma.todo.create({
                data: {
                    id: randomUUIDv7(),
                    runId,
                    taskId: t.id,
                    task: t.task,
                    agent: t.agent,
                    status: t.status === "completed" ? "COMPLETED" : "PENDING",
                    dependency: t.dependency,
                    agentSpecificData: t.designNeeded !== undefined ? { designNeeded: t.designNeeded } : undefined,
                },
            })
        ));

        return res.status(201).json({
            success: true,
            data: created,
        });
    } catch (e) {
        logger.error(`Error occurred while saving todos ${e}`);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});


runRouter.post("/:projectId/:runId/todos/:taskId/summary", internalAuth, async (req: Request, res: Response) => {
    const { projectId, runId, taskId } = req.params;
    const { summary } = req.body as { summary: string };

    if (typeof projectId !== "string" || typeof runId !== "string" || typeof taskId !== "string") {
        return res.status(400).json({
            success: false,
            message: "Invalid params",
        });
    }
    if (typeof summary !== "string") {
        return res.status(400).json({
            success: false,
            message: "summary must be a string",
        });
    }

    try {
        const todo = await prisma.todo.findFirst({
            where: { runId, taskId: Number(taskId) },
        });
        if (!todo) {
            return res.status(404).json({
                success: false,
                message: `Todo ${taskId} not found for run ${runId}`,
            });
        }

        await prisma.todo.update({
            where: { id: todo.id },
            data: { status: "COMPLETED" },
        });
        const saved = await prisma.taskSummary.upsert({
            where: { todoId: todo.id },
            create: { id: randomUUIDv7(), todoId: todo.id, summary },
            update: { summary },
        });

        return res.status(201).json({
            success: true,
            data: saved,
        });
    } catch (e) {
        logger.error(`Error occurred while saving task summary ${e}`);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});

export default runRouter;