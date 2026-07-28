import { Router } from "express";
import type { Request, Response } from "express";
import { auth } from "./middleware";
import { randomUUIDv7 } from "bun";
import { prisma } from "../prisma";
import { redis } from "./redis";
import { logger } from "./utils";
import { runQueue } from "./worker";
import type { OrchestratorEvent } from "../../../../packages/agents";
import type { Answers } from "../../../../packages/agents/types/agentTypes";

const chatRouter = Router()
/*
POST   /chat                          → new project + new run (no projectId given)
POST   /chat/:projectId               → new run under existing project
GET    /chat/:runId/state             → reconstructable UI state for a run, by id alone
GET    /chat/:runId/stream            → SSE for that run
POST   /chat/:runId/stop              → halt run, release sandbox
POST   /chat/:projectId/:runId/continue → answers/selectedDesign, resumes the SAME
                                          pending run (no new run created)

GET    /chat/:projectId/history       → all past runs' events, for reload

*/

chatRouter.post('/', auth, createRun)
chatRouter.post('/:projectId', auth, createRun)

// Event rows are written by the agent worker; a corrupt/truncated one must not
// take down the whole state response.
function parseEventContent(content: string | null, runId: string): unknown {
    if(!content) return null
    try{
        return JSON.parse(content)
    } catch(e){
        logger.error(`Failed to parse stored event content for run ${runId}: ${e}`)
        return null
    }
}

async function markRunFailed(runId: string){
    try{
        await prisma.run.update({where: {id: runId}, data: {status: 'FAILED', endedAt: new Date()}})
    } catch(e){
        logger.error(`Failed to mark run ${runId} as FAILED: ${e}`)
    }
}

async function createRun(req: Request, res: Response){
    const userId = req.headers.userid
    let projectId = req.params?.projectId
    const userPrompt = req.body.userPrompt
    const existingSandboxId = req.body?.sandboxId

    if(typeof userId !== 'string' || typeof userPrompt !== 'string'){
        return res.status(400).json({success: false, message: `Invalid userid or userPrompt`})
    }
    if(!projectId){
        const project = await prisma.project.create({data: {
            id: randomUUIDv7(),
            userId: userId,
        }})
        projectId = project.id
        logger.info(`New Project created`)
    }
    logger.info(`Project id: ${projectId}`)

    if(typeof projectId !== 'string'){
        return res.status(400).json({})
    }

    // const sandbox = await E2BSandbox.StartSandbox(userId, projectId, existingSandboxId )

    const run = await prisma.run.create({data:{
        id: randomUUIDv7(),
        projectId: projectId,
        sandboxId: existingSandboxId ? existingSandboxId : null,
        userPrompt: userPrompt,
    }})
    const runId = run.id
    logger.info(`Run created, id: ${run.id}`)
    const user = await prisma.user.findUnique({where: {id: userId}})

    // activate after testing, #POST-TESTING
    if(!user){
        return res.status(404).json({success: false, message: `User not found :(`})
    }

    try{
        await runQueue.add("run", {
            userId,
            projectId,
            prompt: userPrompt,
            runId: run.id,
            semanticMem: user.semanticMem,
            sandboxId: existingSandboxId ? existingSandboxId : null,
        })
        logger.info(`Added to run queue`)
    } catch(e){
        logger.error(`Failed to enqueue run ${run.id}: ${e}`)
        // The Run row already exists — leaving it IN_PROGRESS would have the
        // frontend waiting on a stream for a job that was never queued.
        await markRunFailed(run.id)
        return res.status(500).json({success: false, message: `Failed to start run`})
    }

    return res.status(200).json({
        success: true,
        runId: run.id,
        projectId: projectId
    })
}

// Lets the frontend reconstruct a run's UI state from just the runId in the
// URL (e.g. /w/:runId after a page refresh) — RunProvider's state otherwise
// only lives in memory for the current tab.
chatRouter.get('/:runId/state', auth, async (req: Request, res: Response) => {
    const { runId } = req.params
    if(typeof runId !== 'string'){
        return res.status(400).json({success: false, message: `Invalid runId type`})
    }

    const run = await prisma.run.findUnique({where: {id: runId}})
    if(!run){
        return res.status(404).json({success: false, message: `Run not found`})
    }

    let pauseEvent: unknown = null
    if(run.status === 'CLARIFICATION_NEEDED' || run.status === 'AWAITING_DESIGN_SELECTION'){
        const event = await prisma.runEvent.findFirst({
            where: { runId, type: run.status === 'CLARIFICATION_NEEDED' ? 'clarification_needed' : 'select_design' },
            orderBy: { createdAt: 'desc' },
        })
        pauseEvent = parseEventContent(event?.content ?? null, runId)
    }

    let completedEvent: unknown = null
    if(run.status === 'COMPLETED'){
        const event = await prisma.runEvent.findFirst({
            where: { runId, type: 'run_completed' },
            orderBy: { createdAt: 'desc' },
        })
        completedEvent = parseEventContent(event?.content ?? null, runId)
    }

    let failedEvent: unknown = null
    if(run.status === 'FAILED'){
        const event = await prisma.runEvent.findFirst({
            where: { runId, type: 'run_failed' },
            orderBy: { createdAt: 'desc' },
        })
        failedEvent = parseEventContent(event?.content ?? null, runId)
    }

    return res.status(200).json({
        success: true,
        data: {
            runId: run.id,
            projectId: run.projectId,
            userPrompt: run.userPrompt,
            status: run.status,
            pauseEvent,
            completedEvent,
            failedEvent,
        },
    })
})

chatRouter.post('/:projectId/:runId/continue', auth, async (req: Request, res: Response) => {
    const userId = req.headers.userid
    const { projectId, runId } = req.params
    const answers: Answers[] = req.body?.answers ?? []
    const selectedDesignId: string | undefined = req.body?.selectedDesignId

    if(typeof userId !== 'string' || typeof projectId !== 'string' || typeof runId !== 'string'){
        return res.status(400).json({success: false, message: `Invalid params`})
    }
    if(!Array.isArray(answers)){
        return res.status(400).json({success: false, message: `answers must be an array (send [] if none)`})
    }

    const run = await prisma.run.findFirst({where: {id: runId, projectId}})
    if(!run){
        return res.status(404).json({success: false, message: `Run not found`})
    }
    if(run.status !== 'CLARIFICATION_NEEDED' && run.status !== 'AWAITING_DESIGN_SELECTION'){
        return res.status(409).json({success: false, message: `Run ${runId} isn't awaiting input`})
    }

    const user = await prisma.user.findUnique({where: {id: userId}})
    if(!user){
        return res.status(404).json({success: false, message: `User not found :(`})
    }

    await prisma.run.update({where: {id: runId}, data: {status: 'IN_PROGRESS'}})

    try{
        await runQueue.add("run", {
            userId,
            projectId,
            prompt: run.userPrompt,
            runId: run.id,
            semanticMem: user.semanticMem,
            sandboxId: run.sandboxId,
            answers,
            selectedDesignId: selectedDesignId ? selectedDesignId : null,
        })
        logger.info(`Continuing run ${run.id}`)
    } catch(e){
        logger.error(`Failed to re-enqueue run ${run.id}: ${e}`)
        // Status was flipped to IN_PROGRESS just above, so it has to be undone
        // or the run is stuck awaiting a job that doesn't exist.
        await markRunFailed(run.id)
        return res.status(500).json({success: false, message: `Failed to continue run`})
    }

    return res.status(200).json({
        success: true,
        runId: run.id,
        projectId
    })
})

// SSE frontend --> Backend
chatRouter.get('/:runId/stream', auth, async (req: Request, res: Response) =>{
    const {runId} = req.params
    if(typeof runId !== 'string'){
        return res.status(400).json({message: 'runId should be of string type'})
    }

    // Validate + fetch before committing to SSE headers, so a bad/missing
    // runId (e.g. a stale reconnect after the run was deleted) gets a clean
    // JSON 404 instead of a half-open SSE response with a JSON body stuffed
    // into it. findUnique (not OrThrow) so this can't become an unhandled
    // rejection that takes the whole process down mid-reconnect.
    const run = await prisma.run.findUnique({where: {id: runId}})
    if(!run){
        return res.status(404).json({message: `Run not found`})
    }

    res.setHeader("content-type", "text/event-stream")
    res.setHeader("cache-control", "no-cache")
    res.setHeader("Connection", "keep-alive")
    res.flushHeaders()

    const pastEvents = await prisma.runEvent.findMany({
        where: { runId: runId, type: { notIn: ['clarification_needed', 'select_design'] } },
        orderBy: { createdAt: "asc" },
    })
    for (const e of pastEvents) {
        if (e.content) res.write(`data: ${e.content}\n\n`)
    }

    if(run.status !== 'IN_PROGRESS'){
        return res.end()
    }

    // The agent runs in a separate worker process, so events arrive over Redis
    // pub/sub (published by createRedisEmitter), not an in-process EventEmitter.
    const subscriber = redis.duplicate();
    await subscriber.subscribe(`run:${runId}`);

    const onMessage = async (_channel: string, message: string) => {
        let event: OrchestratorEvent;
        try{
            event = JSON.parse(message)
        } catch(e){
            logger.error(`Failed to parse event for run ${runId}: ${e}`)
            return
        }

        res.write(`data: ${message}\n\n`)

        // Status is written durably in sessions.ts's /:runId/events handler,
        // which createBackendEmitter hits unconditionally — this redis path is
        // only live if a browser happens to be connected, so it must not be the
        // only place the DB gets updated. This just closes the stream.
        if(event.type === 'run_completed' || event.type === 'run_failed' || event.type === 'clarification_needed' || event.type === 'select_design'){
            res.end()
        }
    }
    subscriber.on("message", onMessage)
    subscriber.on("error", (err) => logger.error(`Redis subscriber error for run ${runId}: ${err}`))

    const heartbeat = setInterval(() => {
        res.write(`: heartbeat\n\n`)
    }, 20000);

    req.on("close", () => {
        clearInterval(heartbeat)
        subscriber.off("message", onMessage)
        subscriber.unsubscribe(`run:${runId}`).finally(() => subscriber.disconnect())
    })

})

chatRouter.get('/:projectId/history', auth, async (req: Request, res: Response) =>{

    const {projectId} = req.params
    if(typeof projectId !== 'string'){
        return res.status(400).json({message: `Invalid projectId type`})
    }
    const runs = await prisma.run.findMany({
        where: { projectId: projectId },
        orderBy: { startedAt: 'desc' },
    })
    return res.status(200).json({
        success: true,
        data: runs
    })
})

export default chatRouter
