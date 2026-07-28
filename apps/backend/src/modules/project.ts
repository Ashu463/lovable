import { Router } from "express";
import { prisma } from "../prisma";
import { auth, type AuthRequest } from "./middleware";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { R2 } from "../../../../packages/agents/agent/services/file-storage/fileStorage";
import { logger } from "./utils";
import { created, forbidden, notFound, ok, requireStrings, serverError, unauthorized } from "./http";
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
    const userId = req.user.id
    if(!userId){
        return unauthorized(res, `UserId not given`)
    }
    const projects = await prisma.project.findMany({where: {userId: userId}})

    if(!projects){
        return notFound(res, `Projects not found`)
    }
    return ok(res, projects)
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
            return serverError(res, `Failed to save into db`)
        }
        return created(res, saveIntoDB, `project created`)
    }catch(e){
        return serverError(res)
    }
})
projectRouter.get("/:projectId", auth, async (req: Request, res: Response) => {
    const params = requireStrings(res, { projectId: req.params.projectId })
    if (!params) return;

    const projects = await prisma.project.findUniqueOrThrow({where: {id: params.projectId}})

    return ok(res, projects)
});
projectRouter.patch('/:projectId', auth, async (req: Request, res: Response) =>{
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

    const params = requireStrings(res, { projectId: req.params.projectId })
    if (!params) return;
    const { projectId } = params

    try{
        const project = await prisma.project.findUniqueOrThrow({where: {id: projectId}})

        if(!project){
            return notFound(res, `Project not found`)
        }
        const dbUpdate = await prisma.project.update({where: {id: projectId}, data: data})
        return ok(res, dbUpdate)
    }
    catch(e){
        return serverError(res)
    }
})

projectRouter.delete('/:projectId', auth, async (req: Request, res: Response) =>{
    const params = requireStrings(res, { projectId: req.params.projectId })
    if (!params) return;

    const dbUpdate = await prisma.project.delete({where: {id: params.projectId}})
    if(!dbUpdate){
        return serverError(res, `Failed to update DB`)
    }
    return ok(res)
});

// Files are synced sandbox -> R2 by E2BSandbox.SyncR2() during the run, so this
// reads the durable copy rather than reconnecting to a possibly-dead sandbox.
projectRouter.get("/:projectId/files", auth, async (req: AuthRequest, res: Response) => {
    const userId = req.user.id;

    const params = requireStrings(res, { projectId: req.params.projectId });
    if (!params) return;
    const { projectId } = params;

    try {
        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project) {
            return notFound(res, "Project not found");
        }
        if (project.userId !== userId) {
            return forbidden(res, "Not your project");
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

        return ok(res, files);
    } catch (e) {
        logger.error(`Failed to list files for project ${projectId}: ${e}`);
        return serverError(res);
    }
});

export default projectRouter