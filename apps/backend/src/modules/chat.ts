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
GET    /chat/:runId/stream            → SSE for that run
POST   /chat/:runId/stop              → halt run, release sandbox
POST   /chat/:projectId/:runId/continue → answers/selectedDesign, resumes the SAME
                                          pending run (no new run created)

GET    /chat/:projectId/history       → all past runs' events, for reload

*/

chatRouter.post('/', auth, createRun)
chatRouter.post('/:projectId', auth, createRun)

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
        return res.status(500).json({success: false, message: `Failed to start run`})
    }

    return res.status(200).json({
        success: true,
        runId: run.id,
        projectId: projectId
    })
}

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
    res.setHeader("content-type", "text/event-stream")
    res.setHeader("cache-control", "no-cache")
    res.setHeader("Connection", "keep-alive")
    res.flushHeaders()

    const {runId} = req.params
    if(typeof runId !== 'string'){
        return res.status(400).json({message: 'runId should be of string type'})
    }

    const run = await prisma.run.findUniqueOrThrow({where: {id: runId}})
    if(!run){
        return res.status(404).json({message: `Run not found`})
    }

    const pastEvents = await prisma.runEvent.findMany({
        where: { runId: runId, type: { notIn: ['clarification_needed', 'select_design'] } },
        orderBy: { createdAt: "asc" },
    })
    for (const e of pastEvents) {
        res.write(`data: ${JSON.stringify(e)}\n\n`)
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
        return res.send(400).json({message: `Invalid projectId type`})
    }
    const runs = await prisma.run.findMany({where: {projectId: projectId}})
    return res.status(200).send({
        success: true,
        data: runs
    })
})

export default chatRouter
