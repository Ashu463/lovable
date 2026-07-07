import { PrismaClient } from "../generated/prisma/client"
import type { AgentResponse, Message } from "../types/agentTypes"
import { SubAgentStatus, type AgentRole, type Answers, type BootstrapResponse } from "../types/types"
import { E2BSandbox } from "./utils/sandbox"
import { skills } from "./skills"
import { CoderAgent } from "./subagents/coder"
import { Researcher } from "./subagents/researcher"
import { b } from "../baml_client"
import {type ComplexityLevel, type Question, type TaskComplexity, type Todo, type Task} from '../baml_client/types'
import { BACKEND_URL, COMPLEXITY_CHECKER_PROMPT, PLAN_TASK_SYSTEM_PROMPT, QUESTION_GENERATOR_PROMPT, TODO_SYSTEM_PROMPT } from "./config/sysPrompts"
import { DAG } from "./services/dag"
import { UIExpert, UIExpert } from "./subagents/uiExpert"
import type { Screen } from "@google/stitch-sdk"
import axios from 'axios'
// This is the orchestrator agent, and will spawn subagents or main agent depending upon the need

/* Steps (updated on 6 july) e2e
- user prompts something
    - if that is self explanable then proceed
    - else ask questions to clarify things first
- Generate three design with varying temperature in order to let model do some creativity
- present it to user and let it select one of them
- then start working on this 
    - decide task complexity and generate todo
    - apply DAG to get right sequence of task
    - start sandbox 
    - orchestrate everything through main agent or subagents. 
    - keep tracking status of every steps 
    
- Main agent flow
    - call respective LLM with query. And each task must be run sequentially.
    - load everything up into the context
    - make memory and update it. 
    - handle partial or failures of the models.
    - return the response.

- Sub agents
    - call parallel DAG
    - spawn subagents with running defined task parallely.
    - context would be maintained within the subagents and final agent would only recieve 
        the summary kinda thing
    - handle partial or failures of the models.
    - return the response
*/
export class OrchestratorAgent{
    private uiExpert: UIExpert
    constructor(
        public userId: string, 
        public projectId: string,
        public sandboxId?: string,
    ){
        this.uiExpert = new UIExpert(userId)
    }

    async Bootstrap(userPrompt: string, answers?: Answers[]): Promise<BootstrapResponse>{
        // I've to store the state somewhere. Probably in backend/db? What say? Just fetch from the backend normally
        const isComplex: ComplexityLevel = await b.CheckComplexity(userPrompt, COMPLEXITY_CHECKER_PROMPT)

        let questions: Question[] = await axios.get(`${BACKEND_URL}/db/getQuestions`);
        if(questions.length === 0){
            if(isComplex.qnaNeeded){
                // qna tool call and complexity checker
                questions = await b.GenerateQuestion(userPrompt, QUESTION_GENERATOR_PROMPT)
                // render these questions to backend and wait for answer
                // tell backend to store the state 
                // return {data: questions}
            }
        }
        if(answers){
            userPrompt += `Answers for these questions ${questions} are:`
            answers.map((ans) => userPrompt += ans)
        }
        let designs: Screen[] = await axios.get(`${BACKEND_URL}/db/getDesigns`)
        if(designs.length === 0){
            // 
            designs = await this.uiExpert.generateDesigns(userPrompt)
            // return {data: designs}
            // return for now wait for any one of the screen.
        }
        const screen: Screen = await axios.get(`${BACKEND_URL}/db/getSelectedScreen`)
        
        const data: BootstrapResponse = {
            userPrompt: userPrompt,
            isComplex: isComplex.complex,
            design: screen
        }
        return data
    }

    async Orchestrate(userPrompt: string, answers?: Answers[]): Promise<string>{

        const data: BootstrapResponse = await this.Bootstrap(userPrompt, answers);

        const sandbox: E2BSandbox = new E2BSandbox()
        const sandboxId: string = await sandbox.StartSandbox(this.userId, this.projectId, this.sandboxId)

        if(data.isComplex){
            const tasks: Todo[] = await b.PlanComplexTask(PLAN_TASK_SYSTEM_PROMPT, data.userPrompt)
            
            const dag: DAG = new DAG(tasks)
            const sequentialTodos: Todo[] = dag.TopologicalSort()

            for(const todo of sequentialTodos){
                const subAgent: SubAgent = new SubAgent(todo.agent, todo.task, sandboxId)
            }
        }
        else{
            // do planning stuff in main agent system prompt itself.
            const mainAgent: MainAgent = new MainAgent(userPrompt, this.userId, sandboxId)

        }
    }

}
// This one would be triggered when there will be no sub agents


class SubAgent{
    constructor(
        public agent: string,
        public task: Task,
        public context: Message[],
        // public skills: Skill[], // TODOs: fix kr bhai isko,
        public sandbox: object,
        public status: SubAgentStatus = SubAgentStatus.Idle,
        private prisma: PrismaClient
    ){}
    async spawnSubAgent(userId: string, agentType: string){
        const user = await this.prisma.user.findUnique({where: {userId}, include:{sandbox: true}})
        let sbId: string = "";
        if(user?.sandbox?.status === 'live'){
            sbId = user.sandbox.sandboxId
        }
        else{
            // create a new sandbox first and update the user as well.
        }
        // sandbox is up, now operate accordingly
        if(agentType === "researcher"){
            let subAgent: Researcher = new Researcher()
        }
        else if(agentType === 'coder'){
            let subAgent: CoderAgent = new CoderAgent(this.prompt, this.context, sbId)
            subAgent.runLoop()
        }

    }
    runLoop(){
        /*Steps: 
        
        - Now for single execution of each task
            - make the LLM Call with given skills, it returns the output
            - execute those skills call
            - parse back to LLM, loop it. 
            - execute tool calls, 
            - spin up the sandbox and write into it. 
            - keep snapshotting the sandbox
            - loop this thing.

        */
    }
}

