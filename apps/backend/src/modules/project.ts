import { Router } from "express";
import { prisma } from "../prisma";
import { auth, type AuthRequest } from "./middleware";
import { authorizeProject, requireUserId } from "./authz";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import { R2 } from "../../../../packages/agents/agent/services/file-storage/fileStorage";
import { logger } from "./utils";
/*Routes:
GET    /projects                                  → list projects for authed user
POST   /projects                                  → create project
GET    /projects/:projectId                       → project metadata
PATCH  /projects/:projectId                       → rename/archive
DELETE /projects/:projectId
GET    /projects/:projectId/files                 → flat list of {path, content} synced from the sandbox
*/
const projectRouter = Router();
const r2 = new R2();

projectRouter.get("/", auth, async (req: AuthRequest, res: Response) => {
    const userId = requireUserId(req, res)
    if(!userId){
        return
    }
    const projects = await prisma.project.findMany({where: {userId: userId}})

    res.status(200).json({success: true, data: projects})
});

projectRouter.post("/", auth, async (req: AuthRequest, res: Response) => {
    // The owner comes from the verified token, never from the request body.
    const userId = requireUserId(req, res)
    if(!userId){
        return
    }
    // I could give it a name but another LLM call happens, 
    // rather do this: make this name field optional and 
    // while generating summary of whole task, ask LLM for the title 
    // and then update it.
    const name = typeof req.body?.name === "string" ? req.body.name : null

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
        logger.error(`Failed to create project: ${e}`)
        return res.status(500).json({success: false, message: `Internal server error`})
    }
})
projectRouter.get("/:projectId", auth, async (req: AuthRequest, res: Response) => {
    const projectId = req.params.projectId
    if (typeof projectId !== "string") {
        return res.status(400).json({
            success: false,
            message: "Invalid projectId",
        });
    }
    if(!(await authorizeProject(req, res, projectId))){
        return
    }
    const project = await prisma.project.findUniqueOrThrow({where: {id: projectId}})

    res.status(200).json({success: true, data: project})
});
projectRouter.patch('/:projectId', auth, async (req: AuthRequest, res: Response) =>{
    const projectId = req.params.projectId
    const { name, archived, starred, isComplex } = req.body ?? {};

    const data: {
        name?: string;
        isArchived?: boolean;
        isStarred?: boolean;
        isComplex?: boolean;
    } = {};

    if (typeof projectId !== "string") {
        return res.status(400).json({
            success: false,
            message: "Invalid projectId",
        });
    }

    if (name !== undefined) {
        if (typeof name !== "string") {
            return res.status(400).json({success: false, message: "name must be a string"})
        }
        data.name = name;
    }

    if (archived !== undefined) {
        if (typeof archived !== "boolean") {
            return res.status(400).json({success: false, message: "archived must be a boolean"})
        }
        data.isArchived = archived;
    }

    if (starred !== undefined) {
        if (typeof starred !== "boolean") {
            return res.status(400).json({success: false, message: "starred must be a boolean"})
        }
        data.isStarred = starred;
    }

    if (isComplex !== undefined) {
        if (typeof isComplex !== "boolean") {
            return res.status(400).json({success: false, message: "isComplex must be a boolean"})
        }
        data.isComplex = isComplex;
    }

    if(!(await authorizeProject(req, res, projectId))){
        return
    }
    try{
        const dbUpdate = await prisma.project.update({where: {id: projectId}, data: data})
        return res.status(200).json({success: true, data: dbUpdate})
    }
    catch(e){
        logger.error(`Failed to update project ${projectId}: ${e}`)
        return res.status(500).json({success: false, message: `Internal Server error`})
    }
})

projectRouter.delete('/:projectId', auth, async (req: AuthRequest, res: Response) =>{
    const projectId = req.params.projectId
    if (typeof projectId !== "string") {
        return res.status(400).json({
            success: false,
            message: "Invalid projectId",
        });
    }
    if(!(await authorizeProject(req, res, projectId))){
        return
    }
    try{
        await prisma.project.delete({where: {id: projectId}})
    } catch(e){
        logger.error(`Failed to delete project ${projectId}: ${e}`)
        return res.status(500).json({success: false, message: `Failed to update DB`})
    }
    res.status(200).json({success: true})
});

// Files are synced sandbox -> R2 by E2BSandbox.SyncR2() during the run, so this
// reads the durable copy rather than reconnecting to a possibly-dead sandbox.
projectRouter.get("/:projectId/files", auth, async (req: AuthRequest, res: Response) => {
    const { projectId } = req.params;

    if (typeof projectId !== "string") {
        return res.status(400).json({ success: false, message: "Invalid projectId" });
    }
    if (!(await authorizeProject(req, res, projectId))) {
        return;
    }

    try {
        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
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