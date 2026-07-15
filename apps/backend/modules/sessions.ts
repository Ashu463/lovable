import { Router, type Request, type Response } from "express";
import { auth } from "./middleware";
import { prisma } from "../src/prisma";
import { randomUUIDv5, randomUUIDv7 } from "bun";
import type { OrchestratorEvent } from "../../../packages/agents";

/*

POST   /internal/sessions/:runId/events
POST   /internal/sessions/:runId/state
*/
const sessionRouter = Router();

sessionRouter.post('/:runId/events', auth, async (req: Request, res: Response) =>{

    const {runId} = req.params
    const event: OrchestratorEvent = req.body

    if(typeof runId !== 'string'){
        return res.send({message: `Invalid runId type`}).status(400)
    }
    const db = await prisma.runEvent.create({data: {
        id: randomUUIDv7(),
        runId: runId,
        type: event.type,
        createdAt: new Date(),
    }})

    return res.status(200).json({success: true, message: `event saved`})
})

sessionRouter.post('/:runId/state', auth, async (req: Request, res: Response) =>{

    const {runId} = req.params
    const data = req.body

    if(typeof runId !== 'string'){
        return res.send({message: `Invalid runId type`}).status(400)
    }
    const db = await prisma.session.create({data: {
        id: randomUUIDv7(),
        session: data.session_snapshot,
        context: data.context_snapshot,
        iteration: data.iteration
    }})

    return res.status(200).json({success: true, message: `session and context state to db`})
})