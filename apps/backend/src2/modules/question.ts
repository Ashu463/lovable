/*Routes: 
GET    /projects/:projectId/questions
*/
import { Router } from "express";
import { prisma } from "../prisma";
import { auth, internalAuth } from "./middleware";
import type { Request, Response } from "express";
import { randomUUIDv7 } from "bun";
import { logger } from "./utils";

type IncomingQuestion = {question: string, option: string[]}

export const questionRouter = Router();

questionRouter.get('/:projectId/getQuestions', auth, async (req: Request, res: Response) =>{
    const projectId = req.params.projectId
    if(typeof projectId !== 'string'){
        return res.status(400).json({
            success: false,
            message: "Invalid projectId",
        });
    }

    try{
        logger.info(`Fetching questions`)
        const questions = await prisma.question.findMany({where: {projectId, clarification: null}})
        return res.status(200).json({success: true, data: questions})
    }
    catch(e){
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
    
})

questionRouter.post('/:projectId/:runId', internalAuth, async (req: Request, res: Response) =>{
    const {projectId, runId} = req.params
    const {questionsObj} = req.body

    if(typeof projectId !== 'string' || typeof runId !== 'string'){
        return res.status(400).json({success: false, message: `Bad types of the params`})
    }
    const result = await Promise.all(
        questionsObj.map((question: IncomingQuestion) =>
            prisma.question.create({
                data: {
                    id: randomUUIDv7(),
                    runId,
                    projectId,
                    question: question.question,
                    options: question.option,
                    createdAt: new Date(),
                },
            })
        )
    );
    return res.status(201).json({
        success: true,
        data: result
    });
})

questionRouter.post('/:projectId/:runId/answers', auth, async (req: Request, res: Response) =>{
    const {projectId, runId} = req.params
    const {answers} = req.body as {answers: {questionId: string, answer: string}[]}

    if(typeof projectId !== 'string' || typeof runId !== 'string'){
        return res.status(400).json({success: false, message: `Bad types of the params`})
    }
    if(!Array.isArray(answers) || answers.length === 0){
        return res.status(400).json({success: false, message: `answers must be a non-empty array`})
    }

    try{
        await Promise.all(answers.map(async ({questionId, answer}) => {
            const question = await prisma.question.findFirst({where: {id: questionId, projectId}})
            if(!question){
                throw new Error(`Question ${questionId} not found for project ${projectId}`)
            }
            return prisma.answers.upsert({
                where: {questionId},
                create: {
                    id: randomUUIDv7(),
                    runId,
                    questionId,
                    questionText: question.question,
                    answer,
                    answeredAt: new Date(),
                },
                update: {
                    answer,
                    answeredAt: new Date(),
                },
            })
        }))
    } catch(e){
        logger.error(`Error occurred while saving answers ${e}`)
        return res.status(500).json({success: false, message: `Internal server error`})
    }

    return res.status(201).json({success: true})
})