/*Routes: 
GET    /projects/:projectId/questions
*/
import { Router } from "express";
import { prisma } from "../prisma";
import { auth } from "./middleware";
import type { Request, Response } from "express";
import { randomUUIDv7 } from "bun";
import type { Question } from "../../generated/prisma/browser";

export const questionRouter = Router();

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

questionRouter.post('/:projectId/:runId', auth, async (req: Request, res: Response) =>{
    const {projectId, runId} = req.params

    const {questionsObj} = req.body

    if(typeof projectId !== 'string' || typeof runId !== 'string'){
        return res.status(400).json({success: false, message: `Bad types of the params`})
    }
    await Promise.all(
        questionsObj.map((question: Question) =>
            prisma.question.create({
            data: {
                id: randomUUIDv7(),
                runId,
                projectId,
                question: question.question,
                options: question.options,
                createdAt: new Date(),
            },
            })
        )
    );
    return res.status(201).json({
        success: true,
    });
})

// questionRouter.post('/:projectId/:questionId/answer', auth, async (req: Request, res: Response) =>{
//     const {runId, questionId} = req.params
//     const {answer} = req.body

//     if(typeof questionId !== 'string' || typeof runId !== 'string'){
//         return res.status(400).json({message: `Invalid data type of questionId`})
//     }

//     const question = await prisma.question.findUnique({where: {id: questionId}})
//     await prisma.answers.create({data:{
//         id: randomUUIDv7(),
//         runId: runId,
//         questionId: questionId,
//         questionText: question.question,
//         answer: answer,
//         createdAt: new Date()
//     }})
//     return res.status(201).json({
//         success: true,
//     });
// })