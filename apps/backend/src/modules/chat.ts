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
POST   /chat                       → new project + new run (no projectId given)
POST   /chat/:projectId            → new run under existing project
GET    /chat/:runId/stream         → SSE for that run
POST   /chat/:runId/stop           → halt run, release sandbox
POST   /chat/:runId/clarifications → answer + resume

GET    /chat/:projectId/history    → all past runs' events, for reload

*/

chatRouter.post('/', auth, createRun)
chatRouter.post('/:projectId', auth, createRun)

async function createRun(req: Request, res: Response){
    const userId = req.headers.userid
    let projectId = req.params?.projectId
    const userPrompt = req.body.userPrompt
    const existingSandboxId = req.body?.sandboxId
    const answers: Answers[] = req.body?.answers
    const selectedDesign: string = req.body?.selectedDesign

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
            answers: answers?.length > 0 ? answers : null,
            selectedDesign: selectedDesign ? selectedDesign : null
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

chatRouter.post('/:projectId/clarifications', auth, async (req: Request, res: Response) =>{

    const userId = req.headers.userid
    const {projectId} = req.params
    const { previousRunId, answers } = req.body
    const existingSandboxId = req.body?.sandboxId

    if(typeof userId !== 'string' || typeof projectId !== 'string'){
        return res.status(400).json({message: `Invalid request`})
    }
    const previousRun = await prisma.run.findUnique({where: {id: previousRunId}})
    if(!previousRun || previousRun.status !== 'CLARIFICATION_NEEDED'){
        return res.status(404).json({message: `Run with ${previousRunId} not found or clarification not needed for this runid`})
    }

    // const sandbox = await E2BSandbox.StartSandbox(userId, projectId, existingSandboxId)

    const run = await prisma.run.create({data: {
        id: randomUUIDv7(),
        projectId: projectId,
        sandboxId: existingSandboxId ? existingSandboxId : null,
        userPrompt: previousRun.userPrompt,
        parentRunId: previousRun.id
    }})
    const user = await prisma.user.findUnique({where: {id: userId}})

    try{
        await runQueue.add("run", {
            userId,
            projectId,
            prompt: run.userPrompt,
            runId: run.id,
            semanticMem: user.semanticMem,
            sandboxId: existingSandboxId ? existingSandboxId : null,
            answers,
        })
    } catch(e){
        logger.error(`Failed to enqueue run ${run.id}: ${e}`)
        return res.status(500).json({success: false, message: `Failed to resume run`})
    }

    return res.status(200).json({
        success: true,
        runId: run.id,
        projectId: projectId
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
        where: { runId: runId },
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

        if(event.type === 'run_completed' || event.type === 'run_failed' || event.type === 'clarification_needed'){
            await prisma.run.update({
                where: {id: run.id},
                data:{
                    status: event.type === "clarification_needed" ? "CLARIFICATION_NEEDED" : event.type === 'run_completed' ? "COMPLETED" : 'FAILED',
                    endedAt: new Date()
                }
            })
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
