/*Routes: 
GET    /projects/:projectId/questions
*/
import { Router } from "express";
import { prisma } from "../src/prisma";
import { auth } from "./middleware";
import type { Request, Response } from "express";

const questionRouter = Router();

questionRouter.get('/:projectId/questions', auth, async (req: Request, res: Response) =>{
    const projectId = req.params.projectId
    if(typeof projectId !== 'string'){
        return res.status(400).json({
            success: false,
            message: "Invalid projectId",
        });
    }

    try{
        const questions = await prisma.project.findUnique({where: {id: projectId}, include: {questions: true}})
        if(!questions){
            return res.status(404).json({
                success: false,
                message: "Question not found",
            });
        }
        return res.status(200).json({success: true, data: questions})
    }   
    catch(e){
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
    
})