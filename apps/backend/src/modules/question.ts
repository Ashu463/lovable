/*Routes: 
GET    /projects/:projectId/questions
*/
import { Router } from "express";
import { prisma } from "../prisma";
import { auth, internalAuth } from "./middleware";
import type { Request, Response } from "express";
import { randomUUIDv7 } from "bun";
import { logger } from "./utils";
import { badRequest, created, ok, requireStrings, serverError } from "./http";

type IncomingQuestion = {question: string, option: string[]}

export const questionRouter = Router();

questionRouter.get('/:projectId/getQuestions', auth, async (req: Request, res: Response) =>{
    const params = requireStrings(res, { projectId: req.params.projectId })
    if(!params) return;
    const { projectId } = params

    try{
        logger.info(`Fetching questions`)
        const questions = await prisma.question.findMany({where: {projectId, clarification: null}})
        return ok(res, questions)
    }
    catch(e){
        return serverError(res)
    }
    
})

questionRouter.post('/:projectId/:runId', internalAuth, async (req: Request, res: Response) =>{
    const {questionsObj} = req.body

    const params = requireStrings(res, {projectId: req.params.projectId, runId: req.params.runId}, `Bad types of the params`)
    if(!params) return;
    const {projectId, runId} = params

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
    return created(res, result);
})

questionRouter.post('/:projectId/:runId/answers', auth, async (req: Request, res: Response) =>{
    const {answers} = req.body as {answers: {questionId: string, answer: string}[]}

    const params = requireStrings(res, {projectId: req.params.projectId, runId: req.params.runId}, `Bad types of the params`)
    if(!params) return;
    const {projectId, runId} = params

    if(!Array.isArray(answers) || answers.length === 0){
        return badRequest(res, `answers must be a non-empty array`)
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
        return serverError(res)
    }

    return created(res)
})