import { Router, type Request, type Response } from "express";
import { internalAuth } from "./middleware";
import { prisma } from "../prisma";
import { randomUUIDv7 } from "bun";
import { isRunSettlingEvent, type OrchestratorEvent } from "../../../../packages/agents";
import { logger } from "./utils";
import { ok, requireStrings, serverError } from "./http";

/*
POST   /internal/sessions/:runId/events
POST   /internal/sessions/:runId/state
*/
const sessionRouter = Router();

sessionRouter.post('/:runId/events', internalAuth, async (req: Request, res: Response) =>{

    const event: OrchestratorEvent = req.body

    const params = requireStrings(res, {runId: req.params.runId}, `Invalid runId type`)
    if(!params) return;
    const {runId} = params

    try{
        await prisma.runEvent.create({data: {
            id: randomUUIDv7(),
            runId: runId,
            type: event.type,
            content: JSON.stringify(event),
            createdAt: new Date(),
        }})

        // The authoritative status write — this endpoint is hit unconditionally
        // by createBackendEmitter, unlike the redis pub/sub path in chat.ts's SSE
        // handler, which only updates status if a browser happens to be
        // connected at the exact moment the event is published.
        if(isRunSettlingEvent(event)){
            const status =
                event.type === 'clarification_needed' ? 'CLARIFICATION_NEEDED' :
                event.type === 'select_design' ? 'AWAITING_DESIGN_SELECTION' :
                event.type === 'run_completed' ? 'COMPLETED' : 'FAILED'
            await prisma.run.update({
                where: {id: runId},
                data: { status, endedAt: new Date() }
            })
        }

        return ok(res, undefined, `event saved`)
    } catch(e){
        logger.error(`Failed to save event for run ${runId}: ${e}`)
        return serverError(res)
    }
})

// Run already carries dedicated snapshot columns for exactly this — no
// separate table needed. Both fields are `String? @db.Text`, so the
// snapshots (which can be arrays or single objects depending on the caller)
// must arrive JSON.stringify'd; we don't re-stringify here since that'd
// double-encode whatever the caller already sent.
sessionRouter.post('/:runId/state', internalAuth, async (req: Request, res: Response) =>{
    const {context_snapshot, session_snapshot, iteration} = req.body as {
        context_snapshot?: string, session_snapshot?: string, iteration?: number
    }

    const params = requireStrings(res, {runId: req.params.runId}, `Invalid runId type`)
    if(!params) return;
    const {runId} = params

    try{
        await prisma.run.update({
            where: {id: runId},
            data: {
                contextSnapshot: context_snapshot,
                sessionSnapshot: session_snapshot,
                currentStep: iteration !== undefined ? String(iteration) : undefined,
            }
        })
        return ok(res, undefined, `session and context state saved`)
    } catch(e){
        logger.error(`Failed to save session state for run ${runId}: ${e}`)
        return serverError(res)
    }
})

export default sessionRouter;