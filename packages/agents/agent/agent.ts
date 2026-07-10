import { PrismaClient } from "../generated/prisma/client"
import type { Project, User } from "../types/agentTypes"
import { SubAgentStatus, type AgentRole, type Answers, type BootstrapResponse } from "../types/types"
import { E2BSandbox } from "./utils/sandbox"
import { b } from "../baml_client"
import {type ComplexityLevel, type Question, type TaskComplexity, type Todo} from '../baml_client/types'
import { COMPLEXITY_CHECKER_PROMPT, PLAN_TASK_SYSTEM_PROMPT, QUESTION_GENERATOR_PROMPT} from "./config/sysPrompts"
import { DAG } from "./services/dag"
import type { Screen } from "@google/stitch-sdk"
import axios from 'axios'
import { MainAgent } from "./mainAgent"
import { BACKEND_URL } from "./config/systemConfig"
import { SubAgent } from "./subAgent"
import { UIExpert } from "./subagents/uiExpert"
import type { SubAgentTaskInput } from "../types/mainAgentTypes"
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

        const user = await axios.get<User>(`${BACKEND_URL}/get/user/${this.userId}`)

        const project = await axios.get<Project>(`${BACKEND_URL}/get/projects/${this.userId}/${this.projectId}`)
        
        if(data.isComplex){
            const tasks: Todo[] = await b.PlanComplexTask(PLAN_TASK_SYSTEM_PROMPT, data.userPrompt)
            
            const dag: DAG = new DAG(tasks)
            const sequentialTodos: Todo[] = dag.TopologicalSort()

            let needsBoilerPlate: boolean = true;
            for(const todo of sequentialTodos){

                if(todo.agent === 'coder'){
                    // make the input and mark boilerplate requirement as false
                    needsBoilerPlate = false

                    if(needsBoilerPlate === false){
                        
                    }
                }
                
                
                const subAgent: SubAgent = new SubAgent()
                if(todo.agent === )
                // if two or three tasks are done, then halt everything and do a quick 
                // debugging and testing.

                // emit sse udpates after completion of each step
                // that testing trigger after two to three task completion
            }
        }
        else{
            // do planning stuff in main agent system prompt itself.
            const mainAgent: MainAgent = new MainAgent(userPrompt, this.userId, this.projectId, sessionId, user.data.semanticMem, project.data.sessions, project.data.context, sandboxId)

            mainAgent.runLoop()

            // trigger evals
            // trigger deploy pipeline.
            // and then epilouge.
        }
    }

    buildTaskInput(todo: Todo, priorResults: Map<string, TaskSummary>): SubAgentTaskInput {
        switch (todo.agent) {
            case 'coder':
            return { agentType: 'coder', boilerplate: getBoilerplateFor(todo), task: todo }
            case 'debugger':
            return { agentType: 'debugger', errors: collectErrorsFrom(priorResults), toolResult: getLastToolResult(priorResults), task: todo }
            case 'tester':
            return { agentType: 'tester', error: getRelevantError(todo), task: todo }
            case 'researcher':
            return { agentType: 'researcher', query: todo.query!, maxResults: todo.maxResults ?? 5, task: todo }
            default:
            throw new Error(`Unknown agent type: ${todo.agent}`)
        }
    }

    createSubAgent(
        input: SubAgentTaskInput,
        userId: string,
        projectId: string,
        sandboxId: string,
        semanticMem: string,
        ): SubAgent<SubAgentTaskInput> {
        switch (input.agentType) {
            case 'coder':
            return new SubAgent<CoderTaskInput>(input, userId, projectId, sandboxId, semanticMem)
            case 'debugger':
            return new SubAgent<DebuggerTaskInput>(input, userId, projectId, sandboxId, semanticMem)
            case 'tester':
            return new SubAgent<TesterTaskInput>(input, userId, projectId, sandboxId, semanticMem)
            case 'researcher':
            return new SubAgent<ResearchTaskInput>(input, userId, projectId, sandboxId, semanticMem)
        }
    }
    buildSubAgentInput(todo: Todo): SubAgentTaskInput {
        switch (todo.agent) {
            case "coder":
                return {
                    agentType: "coder",
                    task: todo,
                };

            case "debugger":
            return {
                agentType: "debugger",
                errors: this.currentErrors,
                toolResult: this.lastToolResult,
                task: todo,
            };

            case "tester":
            return {
                agentType: "tester",
                error: this.lastError,
                task: todo,
            };

            case "researcher":
            return {
                agentType: "researcher",
                query: todo.task,
                maxResults: 10,
                task: todo,
            };

            default:
            throw new Error(`Unknown agent ${todo.agent}`);
        }
    }

}
// This one would be triggered when there will be no sub agents

