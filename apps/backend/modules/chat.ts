import { Router } from "express";
import type { Request, Response } from "express";
import { auth } from "./middleware";
import { AgentCall, SpinUpSandbox, type EventEmitter, type OrchestratorEvent } from "../../../packages/agents";
import { randomUUIDv7 } from "bun";
import { prisma } from "../src/prisma";
import { EventStream } from "openai/lib/EventStream.js";
import { getBus } from "./events";

const chatRouter = Router()

chatRouter.post('/:projectId', auth, async (req: Request, res: Response) =>{
    const userId = req.headers.userId
    let projectId = req.params?.projectId
    const userPrompt = req.body.userPrompt
    if(typeof userId !== 'string' || typeof userPrompt !== 'string'){
        return res.status(400).json({success: false, message: `Invalid userid or userPrompt`})
    }
    if(!projectId){
        const project = await prisma.project.create({data: {
            id: randomUUIDv7(),
            userId: userId,
        }})
        projectId = project.id
    }
    if(typeof projectId !== 'string'){
        return res.status(400).json({})
    }
    const sandboxId = await SpinUpSandbox(userId, projectId)

    const run = await prisma.run.create({data:{
        id: randomUUIDv7(),
        projectId: projectId, 
        sandboxId: sandboxId,
        userPrompt: userPrompt,
    }})
    AgentCall(userId, projectId, userPrompt, run.id)

    return res.status(200).json({
        success: true,
        runId: run.id,
        projectId: projectId
    })
})

chatRouter.post('/:projectId/clarifications', auth, async (req: Request, res: Response) =>{

    const userId = req.headers.userId
    const {projectId} = req.params
    const { previousRunId, answers} = req.body

    if(typeof userId !== 'string' || typeof projectId !== 'string'){
        return res.status(400).json({message: `Invalid request`})
    }
    const previousRun = await prisma.run.findUnique({where: {id: previousRunId}})
    if(!previousRun || previousRun.status !== 'CLARIFICATION_NEEDED'){
        return res.status(404).json({message: `Run with ${previousRunId} not found or clarification not needed for this runid`})
    }

    const sandboxId = await SpinUpSandbox(userId, projectId)

    const run = await prisma.run.create({data: {
        id: randomUUIDv7(),
        projectId: projectId,
        sandboxId,
        userPrompt: previousRun.userPrompt,
        parentRunId: previousRun.id
    }})

    AgentCall(userId, projectId, run.userPrompt, run.id, answers)

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
        res.end()
    }
    
    const bus = getBus(runId);
    const onEvent = async (event: OrchestratorEvent) =>{
        res.write(`data: ${JSON.stringify(event)}\n\n`)
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
    bus.on("event", onEvent)

    const heartbeat = setInterval(() => {
        res.write(`: heartbeat\n\n`)
    }, 20000);

    req.on("close", () =>{
        bus.off("event", onEvent)
        clearInterval(heartbeat)
    })
          
})



export default chatRouter
