import { Router } from "express";
import { prisma } from "../prisma";
import { auth, internalAuth } from "./middleware";
import type { Request, Response } from "express";
import { randomUUIDv7 } from "bun";
import { logger } from "./utils";
import { badRequest, created, notFound, ok, requireStrings, serverError } from "./http";
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
    const params = requireStrings(res, { projectId: req.params.projectId });
    if (!params) return;

    try {
        const runs = await prisma.run.findMany({
            where: {
                projectId: params.projectId,
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

        return ok(res, runs);
    } catch (e) {
        return serverError(res);
    }
});


runRouter.get("/:projectId/runs/:runId", auth, async (req: Request, res: Response) => {
    const params = requireStrings(res, { projectId: req.params.projectId, runId: req.params.runId });
    if (!params) return;
    const { projectId, runId } = params;

    try {
        const run = await prisma.run.findFirst({
            where: {
                id: runId,
                projectId: projectId,
            },
        });

        if (!run) {
            return notFound(res, "Run not found");
        }

        return ok(res, run);
    } catch (e) {
        return serverError(res);
    }
});


runRouter.get("/:projectId/:runId/todos", auth, async (req: Request, res: Response) => {
    const params = requireStrings(res, { projectId: req.params.projectId, runId: req.params.runId });
    if (!params) return;
    const { projectId, runId } = params;

    try {
        const run = await prisma.run.findFirst({
            where: {
                id: runId,
                projectId: projectId,
            },
        });

        if (!run) {
            return notFound(res, "Run not found");
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

        return ok(res, todos);
    } catch (e) {
        return serverError(res);
    }
});


runRouter.get("/:projectId/:runId/summaries", auth, async (req: Request, res: Response) => {
    const params = requireStrings(res, { projectId: req.params.projectId, runId: req.params.runId });
    if (!params) return;
    const { projectId, runId } = params;

    try {
        const run = await prisma.run.findFirst({
            where: {
                id: runId,
                projectId: projectId,
            },
        });

        if (!run) {
            return notFound(res, "Run not found");
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

        return ok(res, summaries);
    } catch (e) {
        return serverError(res);
    }
});


runRouter.post("/:projectId/:runId/todos", internalAuth, async (req: Request, res: Response) => {
    logger.info(`Saving todos to the db`)

    const { todos } = req.body as {
        todos: {id: number, task: string, agent: AgentType, status: "pending" | "completed", dependency: number[], designNeeded?: boolean}[]
    };

    const params = requireStrings(res, { projectId: req.params.projectId, runId: req.params.runId });
    if (!params) return;
    const { runId } = params;

    if (!Array.isArray(todos) || todos.length === 0) {
        return badRequest(res, "todos must be a non-empty array");
    }

    try {
    logger.info(`calling promises to save todos`)

        const createdTodos = await Promise.all(todos.map((t) =>
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

        return created(res, createdTodos);
    } catch (e) {
        logger.error(`Error occurred while saving todos ${e}`);
        return serverError(res);
    }
});


runRouter.post("/:projectId/:runId/todos/:taskId/summary", internalAuth, async (req: Request, res: Response) => {
    const { summary } = req.body as { summary: string };

    const params = requireStrings(res, {
        projectId: req.params.projectId,
        runId: req.params.runId,
        taskId: req.params.taskId,
    });
    if (!params) return;
    const { runId, taskId } = params;

    if (typeof summary !== "string") {
        return badRequest(res, "summary must be a string");
    }

    try {
        const todo = await prisma.todo.findFirst({
            where: { runId, taskId: Number(taskId) },
        });
        if (!todo) {
            return notFound(res, `Todo ${taskId} not found for run ${runId}`);
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

        return created(res, saved);
    } catch (e) {
        logger.error(`Error occurred while saving task summary ${e}`);
        return serverError(res);
    }
});

export default runRouter;
