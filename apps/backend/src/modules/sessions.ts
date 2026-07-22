import { Router, type Request, type Response } from "express";
import { internalAuth } from "./middleware";
import { prisma } from "../prisma";
import { randomUUIDv7 } from "bun";
import type { OrchestratorEvent } from "../../../../packages/agents";
import { logger } from "./utils";

/*
POST   /internal/sessions/:runId/events
POST   /internal/sessions/:runId/state
*/
const sessionRouter = Router();

sessionRouter.post('/:runId/events', internalAuth, async (req: Request, res: Response) =>{

    const {runId} = req.params
    const event: OrchestratorEvent = req.body

    if(typeof runId !== 'string'){
        return res.status(400).json({success: false, message: `Invalid runId type`})
    }

    try{
        await prisma.runEvent.create({data: {
            id: randomUUIDv7(),
            runId: runId,
            type: event.type,
            createdAt: new Date(),
        }})
        return res.status(200).json({success: true, message: `event saved`})
    } catch(e){
        logger.error(`Failed to save event for run ${runId}: ${e}`)
        return res.status(500).json({success: false, message: `Internal server error`})
    }
})

// Run already carries dedicated snapshot columns for exactly this — no
// separate table needed. Both fields are `String? @db.Text`, so the
// snapshots (which can be arrays or single objects depending on the caller)
// must arrive JSON.stringify'd; we don't re-stringify here since that'd
// double-encode whatever the caller already sent.
sessionRouter.post('/:runId/state', internalAuth, async (req: Request, res: Response) =>{
    const {runId} = req.params
    const {context_snapshot, session_snapshot, iteration} = req.body as {
        context_snapshot?: string, session_snapshot?: string, iteration?: number
    }

    if(typeof runId !== 'string'){
        return res.status(400).json({success: false, message: `Invalid runId type`})
    }

    try{
        await prisma.run.update({
            where: {id: runId},
            data: {
                contextSnapshot: context_snapshot,
                sessionSnapshot: session_snapshot,
                currentStep: iteration !== undefined ? String(iteration) : undefined,
            }
        })
        return res.status(200).json({success: true, message: `session and context state saved`})
    } catch(e){
        logger.error(`Failed to save session state for run ${runId}: ${e}`)
        return res.status(500).json({success: false, message: `Internal server error`})
    }
})

export default sessionRouter;