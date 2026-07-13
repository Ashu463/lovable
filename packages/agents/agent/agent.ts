import { PrismaClient } from "../generated/prisma/client"
import type { Project, User } from "../types/agentTypes"
import { SubAgentStatus, type AgentRole, type Answers, type BootstrapResponse } from "../types/types"
import { E2BSandbox } from "./utils/sandbox"
import { b } from "../baml_client"
import {type ComplexityLevel, type Error, type Message, type Question, type TaskComplexity, type TaskSummary, type PlannerTodo, type ToolResult} from '../baml_client/types'
import { COMPLEXITY_CHECKER_PROMPT, PLAN_TASK_SYSTEM_PROMPT, QUESTION_GENERATOR_PROMPT} from "./config/sysPrompts"
import { DAG } from "./services/dag"
import type { Screen } from "@google/stitch-sdk"
import axios from 'axios'
import { MainAgent } from "./mainAgent"
import { BACKEND_URL, DEBUGGERR_MAX_ITERATIONS, MAX_SUBAGENT_ITERATIONS } from "./config/systemConfig"
import { SubAgent } from "./subAgent"
import { UIExpert } from "./subagents/uiExpert"
import type { InputMap, SubAgentType } from "../types/subAgentsTypes"


type InputBuilder<T extends SubAgentType> = (todo: PlannerTodo, ctx: OrchestratorContext[], extra?: unknown) => InputMap[T]
type InputBuilders = { [K in SubAgentType]: InputBuilder<K> }
type Agent = "coder" | "debugger" | "tester" | "uiExpert" | "researcher"
interface OrchestratorContext{
    taskId: number,
    task: string, 
    agentAssigned: Agent, 
    success: boolean, 
    summary: string
}

export class OrchestratorAgent{
    private uiExpert: UIExpert
    private context: OrchestratorContext[]
    private sandbox: E2BSandbox = new E2BSandbox()
    constructor(
        public userId: string, 
        public projectId: string,
        public sandboxId: string, // initially pass this as empty string, here after connecting it would have some value
        public extra: unknown as CoderTaskInput,
    ){
        this.uiExpert = new UIExpert(userId)
        this.context = []
    }

    
    shouldProvideBoilerPlate(): Boolean{

        return true;
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

        this.sandboxId = await this.sandbox.StartSandbox(this.userId, this.projectId, this.sandboxId)

        const user = await axios.get<User>(`${BACKEND_URL}/get/user/${this.userId}`)

        const project = await axios.get<Project>(`${BACKEND_URL}/get/projects/${this.userId}/${this.projectId}`)
        
        if(!data.isComplex){
            // do planning stuff in main agent system prompt itself.
            const mainAgent: MainAgent = new MainAgent(userPrompt, this.userId, this.projectId, sessionId, user.data.semanticMem, project.data.sessions, project.data.context, sandboxId)

            mainAgent.runLoop()

            // trigger evals
            // trigger deploy pipeline.
            // and then epilouge.
        }
        else{
            const tasks: PlannerTodo[] = await b.PlanComplexTask(PLAN_TASK_SYSTEM_PROMPT, data.userPrompt)
            
            const dag: DAG = new DAG(tasks)
            const sequentialTodos: PlannerTodo[] = dag.TopologicalSort()

            const inputBuilders: InputBuilders = {
                coder: (todo, ctx, extra) => ({
                    task: todo,
                    agentType: 'coder',
                    // boilerPlate: data.design // FIX: to be updated 
                }),
                debuggerr: (todo, ctx, extra) => ({
                    task: todo,
                    agentType: 'debuggerr',
                    errors: (extra as {errors: Error[]}).errors,
                    toolResult: (extra as {toolResult: ToolResult}).toolResult
                }),
                tester: (todo, ctx, extra) => ({
                    task: todo,
                    agentType: 'tester',
                    error: (extra as {error: Error}).error
                }),
                researcher: (todo, ctx, extra) => ({
                    task: todo, 
                    agentType: 'researcher',
                    query: (extra as {query: string}).query,
                    maxResults: (extra as {maxResults: number}).maxResults
                }),
                uiExpert: (todo, ctx, extra) => ({
                    task: todo, 
                    agentType: 'uiExpert',
                    query: (extra as {query: string}).query
                })
            }
    
            let intialCoderCall = true;
            let iteration: number = 0;
            /* Discussion: 
            - I mean this totally makes sense that we should always run that tester <-> debugger loop after every coder task
            - 
    
            Updated loop according to me: 
            - received tasks from planner
            - spawn that subagent and complete it's task 
            - if that agent is coder then run the tester and debugger loop. 
            - Rest the subagent's runLoop() method is handling everything
    
            */
            for(let i = 0 ; i < sequentialTodos.length; i++){
                // guardrail for the todo to ne not null
                const todo = sequentialTodos[i];
                if (!todo?.agent) continue;

                const agentType: SubAgentType = todo?.agent
                
                const builder = inputBuilders[agentType]
                const input = builder(todo, this.context, extra)
                
                const subagent = new SubAgent(agentType, input, this.userId, this.projectId, this.sandboxId, user.data.semanticMem)
            }
            // spawn tester here
            // runloop of tester to fetch the errors
            // parse those errors to debugger
            // runloop of debugger
            // loop this thing for MAX_TESTING_TIMES
            // subagent spawning
            // context making for various subagents i.e. that taskId
            
            // calling subagent
            // waiting for it's completion
            // generating summary and pushing into orchestrator context[], {taskId, task, agentAssigned, summary, status}
            // reseponse/state formation for orchestrator iself {status, detailSummary, errors (if any)}
            // emit sse udpates after completion of each step
            // 
            
            
        }
    }

    // -------------Everything below is for subagents ----------------
    buildTaskInput(todo: PlannerTodo, priorResults: Map<string, TaskSummary>): InputMap {
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
        input: InputMap,
        userId: string,
        projectId: string,
        sandboxId: string,
        semanticMem: string,
        ): SubAgent<InputMap> {
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
    buildSubAgentInput(todo: PlannerTodo): InputMap {
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
    async GenerateSummary(): Promise<string>{

    }
    // that tester <-> debugger loop
    async TesterAndDebuggerLoop(): Promise<string>{


        while(true){
            const sandboxRes = await this.sandbox.Execute(this.sandboxId, {action: "runCommand", command: "npm run dev"})

            if(sandboxRes.success === false){
                //call debugger with the error: 
                const error = sandboxRes.stderr || sandboxRes.stdout

            }

        }
    }
}
// This one would be triggered when there will be no sub agents

/* Subagents orchestration
* I didn't get what you said about initial coder call variable and what's really wrong with that? 
* tasks here mean the list of todos that planner had made which is ultimately the dag list, so whenever 2 such todos get completed by the agent then test them. and testing means, tester runs npm run dev or on the server and fetches the error if came any and hand it over it to the debugger. Rest debugger will fix it and there would be back-and-forth between tester and debugger until it gets fixed. A halt should be there in order to save it from complete stuck failure. 
* yeah you are right, listen orchestrator is an agent not LLM which could run anything by itself. I'm the one who is sitting beside orchestrator deciding what should happen after each scenario. Now your first case where you said "orchestrator(O) can decide what to dispatch next" seems like "O" is itself too intelligent which is not true. I've predecided what to happen next for each scenario, if task succeeded, failed, partially failed or taking too much time. 
* I'll be needing that mutex lock thing while write over anyfile not now, because I'm only following the topo sort stuff not it's parallel running DAG tasks. 
* that should be discussed, what context means for each subagents. And this context should be present and shouldn't be compressed further. As per my POV:
   *  i) coder should get details of all those tasks on which this task is dependent(some kinda summary which you're telling earlier), current tree structure of repository. 
   * tester wouldn't be requiring anything but debugger should have all the errors which he fixed in one testing session. Since tester and debugger would go hand in hand, therefore for one particular testing session, debugger must hold all the fixes he made during the session is completed. 
   * Researcher should store all the information in knowledge base/graph for whatever he searched till now for whole complete session till this orchestrator has been spawned. Because it would be better that it can retreive the information if already present in it's graph. 
   * UI expert is just a MCP call to stitch, thus it would only need userPrompt nothing into the context.
   * 
   * 
* Halt condition for debugger: When error signature doesn't change after 2 iteration of debugger. 
*/



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

-------------boilerPlate for coder, Updated UI expert ----------------
Also the main subagent class itself frame context, I don't need to take  care about that. 
I got the idea of sending the boilerPlate. The first coder task doesn't seems reasonable 
because it might be the case when the task need to have a fresh boilerPlate. I consider a 
bad situtation in my mind that UI expert would only be called at the very starting time 
which isn't true at all, maybe the complex task is divided into so many screen generation 
task where the UI expert needed to generate the design, and in that case coder would need 
the boiler plate there fore checking the initial call is a total diaster. Now the solution 
would be to make the UI expert agent as child class for base agent which I'll do later, and 
solution to the boiler plate would be: store the boilerPlate into sandbox generated by 
UI expert always and always; and write this into the system prompt of coder agent that 
fetch boilerPlate whenever you need it. that's just a simple tool call. Rest all other 
solutions doesn't seems good to me, give your suggestions. Right now I've to update the 
UI expert and I'm assuming my UI expert would be so intelligent that it could work on 
previous generated design and update that and create new design for more other pages 
following that specific design since I got to know that planner could generate consecutive 
UI expert tasks. And thus shouldProvideBoilerPlate() won't make sense, what say?


A great trade off: 
I got a trade off if we are keeping the boiler plate inside a tool call, 
there might be the possibility that coder agent never call it, 
in that case it would get hallucinated a lot; which I would never want. 
And the second way to store into the context would get compressed heavily
(and that make sense a lot coz context compaction or summarization would be 
hit only when at least 5 to 6 calls have been happened), 
the third way is to make boiler plate mandatory field which would burst out the context window. 
I'm geniunely interested in your true opinion. Think deeply and carefully.
*/