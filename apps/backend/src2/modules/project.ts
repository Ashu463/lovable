import { Router } from "express";
import { prisma } from "../../src/lib/prisma";
import { auth, type AuthRequest } from "../../src/lib/middleware";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { R2 } from "../../../../packages/agents/agent/services/file-storage/fileStorage";
import { E2BSandbox } from "../../../../packages/agents/agent/utils/sandbox";
import { logger } from "../../src/lib/utils";
/*Routes:
GET    /projects                                  → list projects for authed user
POST   /projects                                  → create project
GET    /projects/:projectId                       → project metadata (cheap, also used internally)
GET    /projects/:projectId/session               → boots sandbox + live previewUrl
PATCH  /projects/:projectId                       → rename/archive
DELETE /projects/:projectId
GET    /projects/:projectId/files                 → flat list of {path, content} synced from the sandbox
*/
const projectRouter = Router();
const r2 = new R2();

projectRouter.get("/", auth, async (req: AuthRequest, res: Response) => {
    const userId = req.user.id
    if(!userId){
        
        res.status(401).json({success: false, message: `UserId not given`})
    }
    await prisma.project.findMany({where: {userId: userId}})
    const projects = await prisma.project.findMany({where: {userId: userId}})

    if(!projects){
        res.status(404).json({success: false, message: `Projects not found`})
    }
    res.status(200).json({success: true, data: projects})
});

projectRouter.post("/", async (req: Request, res: Response) => {
    
    const userId = req.body.userId
    // I could give it a name but another LLM call happens, 
    // rather do this: make this name field optional and 
    // while generating summary of whole task, ask LLM for the title 
    // and then update it.
    const name = req.body.name 

    try{
        const saveIntoDB = await prisma.project.create({
            data:{
                id: randomUUID(),
                userId: userId, 
                name: name
            }
        })
        if(!saveIntoDB){
            return res.status(500).json({success: false, message: `Failed to save into db`})
        }
        return res.status(201).json({success: true, message: `project created`, data: saveIntoDB})
    }catch(e){
        return res.json(500).json({message: `Internal server error`})
    }
})

// Plain metadata — must stay cheap. The orchestrator hits this on every run's
// Bootstrap() via internalAuthHeader to read the cached isComplex verdict, so no
// sandbox work belongs here; that lives in GET /:projectId/session below.
projectRouter.get("/:projectId", auth, async (req: AuthRequest, res: Response) => {
    const projectId = req.params.projectId

    if (typeof projectId !== "string") {
        return res.status(400).json({
            success: false,
            message: "Invalid projectId",
        });
    }

    const project = await prisma.project.findUnique({where: {id: projectId}})
    if(!project){
        return res.status(404).json({success: false, message: `Project not found`})
    }
    if(req.user && project.userId !== req.user.id){
        return res.status(403).json({success: false, message: `Not your project`})
    }

    res.status(200).json({success: true, data: project})
});

projectRouter.get("/:projectId/session", auth, async (req: AuthRequest, res: Response) => {
    const projectId = req.params.projectId
    const userId = req.user?.id

    if (typeof projectId !== "string") {
        return res.status(400).json({ success: false, message: "Invalid projectId" });
    }

    const project = await prisma.project.findUnique({where: {id: projectId}})
    if(!project){
        return res.status(404).json({success: false, message: `Project not found`})
    }
    if(userId && project.userId !== userId){
        return res.status(403).json({success: false, message: `Not your project`})
    }

    const latestRun = await prisma.run.findFirst({
        where: { projectId },
        orderBy: { startedAt: 'desc' },
    })

    let previewUrl: string | null = null
    let sandboxId: string | null = latestRun?.sandboxId ?? null

    try{
        const sandbox = await E2BSandbox.StartSandbox(project.userId, projectId, latestRun?.sandboxId ?? undefined)
        sandboxId = sandbox.sandboxId
        previewUrl = await sandbox.GetPreviewUrl()

        if(latestRun && sandbox.sandboxId !== latestRun.sandboxId){
            await prisma.run.update({where: {id: latestRun.id}, data: {sandboxId: sandbox.sandboxId}})
        }

        // Keep the stored run_completed event in sync so /chat/:runId/state (which
        // Workspace reads on load) hands back the refreshed URL, not the dead one.
        if(latestRun?.status === 'COMPLETED'){
            const event = await prisma.runEvent.findFirst({
                where: { runId: latestRun.id, type: 'run_completed' },
                orderBy: { createdAt: 'desc' },
            })
            if(event?.content){
                const parsed = JSON.parse(event.content)
                if(parsed?.result){
                    parsed.result.previewUrl = previewUrl
                    await prisma.runEvent.update({where: {id: event.id}, data: {content: JSON.stringify(parsed)}})
                }
            }
        }
    } catch(e){
        logger.error(`Failed to open sandbox for project ${projectId}: ${e}`)
    }

    res.status(200).json({
        success: true,
        data: {
            ...project,
            latestRunId: latestRun?.id ?? null,
            sandboxId,
            previewUrl,
        },
    })
});
projectRouter.patch('/:projectId', auth, async (req: Request, res: Response) =>{
    const projectId = req.params.projectId
    const { name, archived, starred, isComplex } = req.body;

    const data: {
        name?: string;
        isArchived?: boolean;
        isStarred?: boolean;
        isComplex?: boolean;
    } = {};

    if (name !== undefined) {
        data.name = name;
    }

    if (archived !== undefined) {
        data.isArchived = archived;
    }

    if (starred !== undefined) {
        data.isStarred = starred;
    }

    if (isComplex !== undefined) {
        data.isComplex = isComplex;
    }

    if (typeof projectId !== "string") {
        return res.status(400).json({
            success: false,
            message: "Invalid projectId",
        });
    }
    try{
        const project = await prisma.project.findUniqueOrThrow({where: {id: projectId}})

        if(!project){
            return res.status(404).json({message: `Project not found`})
        }
        const dbUpdate = await prisma.project.update({where: {id: projectId}, data: data})
        return res.status(200).json({success: true, data: dbUpdate})
    }
    catch(e){
        return res.status(500).json({message: `Internal Server error`})
    }
})

projectRouter.delete('/:projectId', auth, async (req: Request, res: Response) =>{
    const projectId = req.params.projectId
    if(!projectId){
        
        res.status(401).json({success: false, message: `UserId not given`})
    }
    if (typeof projectId !== "string") {
        return res.status(400).json({
            success: false,
            message: "Invalid projectId",
        });
    }
    const dbUpdate = await prisma.project.delete({where: {id: projectId}})
    if(!dbUpdate){
        return res.send(500).json({success: false, message: `Failed to update DB`})
    }
    res.status(200).json({success: true})
});

// Files are synced sandbox -> R2 by E2BSandbox.SyncR2() during the run, so this
// reads the durable copy rather than reconnecting to a possibly-dead sandbox.
projectRouter.get("/:projectId/files", auth, async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;
    const userId = req.user.id;

    if (typeof projectId !== "string") {
        return res.status(400).json({ success: false, message: "Invalid projectId" });
    }

    try {
        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }
        if (project.userId !== userId) {
            return res.status(403).json({ success: false, message: "Not your project" });
        }

        const prefix = r2.filesPrefix(project.userId, projectId);
        const keys = await r2.listFiles(prefix);

        const files: { path: string; content: string }[] = [];
        for (let i = 0; i < keys.length; i += 10) {
            const batch = keys.slice(i, i + 10);
            const batchFiles = await Promise.all(
                batch.map(async (key) => ({
                    path: key.replace(prefix, ""),
                    content: await r2.getFile(key),
                })),
            );
            files.push(...batchFiles);
        }

        return res.status(200).json({ success: true, data: files });
    } catch (e) {
        logger.error(`Failed to list files for project ${projectId}: ${e}`);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});

export default projectRouter