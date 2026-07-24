import { Router } from "express";
import { prisma } from "../prisma";
import { auth, type AuthRequest } from "./middleware";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
/*Routes: 
GET    /projects                                  → list projects for authed user
POST   /projects                                  → create project
GET    /projects/:projectId                       → project metadata
PATCH  /projects/:projectId                       → rename/archive
DELETE /projects/:projectId
*/
const projectRouter = Router();

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
            return res.json(500).json({success: false, message: `Failed to save into db`})
        }
        return res.json(200).json({success: true, message: `project created`, data: saveIntoDB})
    }catch(e){
        return res.json(500).json({message: `Internal server error`})
    }
})
projectRouter.get("/:projectId", auth, async (req: Request, res: Response) => {
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
    const projects = await prisma.project.findUniqueOrThrow({where: {id: projectId}})

    res.status(200).json({success: true, data: projects})
});
projectRouter.patch('/:projectId', auth, async (req: Request, res: Response) =>{
    const projectId = req.params.projectId
    const { name, archived } = req.body;

    const data: {
        name?: string;
        archived?: boolean;
    } = {};

    if (name !== undefined) {
        data.name = name;
    }

    if (archived !== undefined) {
        data.archived = archived;
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
        if(!dbUpdate){
            return res.send()
        }
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

export default projectRouter