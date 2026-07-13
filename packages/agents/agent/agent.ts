import { PrismaClient } from "../generated/prisma/client"
import type { OrchestratorResponse, OrchestratorSSE, Project, User } from "../types/agentTypes"
import { SubAgentStatus, type AgentRole, type Answers, type BootstrapResponse } from "../types/types"
import { E2BSandbox } from "./utils/sandbox"
import { b } from "../baml_client"
import {type ComplexityLevel, type Error, type Message, type Question, type TaskComplexity, type TaskSummary, type PlannerTodo, type ToolResult} from '../baml_client/types'
import { CODER_PROMPT, COMPLEXITY_CHECKER_PROMPT, ORCHESTRATOR_SUMMARY_PROMPT, PLAN_TASK_SYSTEM_PROMPT, QUESTION_GENERATOR_PROMPT} from "./config/sysPrompts"
import { DAG } from "./services/dag"
import type { Screen } from "@google/stitch-sdk"
import axios from 'axios'
import { MainAgent } from "./mainAgent"
import { BACKEND_URL, DEBUGGERR_MAX_ITERATIONS, MAX_SUBAGENT_ITERATIONS } from "./config/systemConfig"
import { SubAgent } from "./subAgent"
import { UIExpert } from "./subagents/uiExpert"
import type { InputMap, SubAgentResponse, SubAgentsTodo, SubAgentType } from "../types/subAgentsTypes"
import type { MainAgentResponse, SSEBody } from "../types/mainAgentTypes"
import type { TesterResponse } from "./subagents/tester"


type InputBuilder<T extends SubAgentType> = (
    todo: PlannerTodo, 
    ctx: OrchestratorContext[],
    orchestratorState: OrchestratorState
) => InputMap[T]

type InputBuilders = { [K in SubAgentType]: InputBuilder<K> }
interface OrchestratorContext{
    taskId: number,
    task: string, 
    agentAssigned: SubAgentType, 
    success: boolean, 
    summary: string,
}
type OrchestratorState = {
  screenId: string | null                       // current/most-recent screen context, if relevant
  screenIdByTaskId: Map<number, string>          // taskId (uiExpert) -> screenId, for dependency-specific lookups
  lastTestErrors: Error[]
  lastToolResult: ToolResult | null
  lastError: Error | null
  errorsByTaskId: Map<number, Error[]>           // taskId (tester) -> errors, if debugger needs a specific tester's output
}

export class OrchestratorAgent{
    private uiExpert: UIExpert
    private context: OrchestratorContext[]
    private state: OrchestratorState
    private sandbox: E2BSandbox = new E2BSandbox()
    constructor(
        public userId: string, 
        public projectId: string,
        public sandboxId: string, // initially pass this as empty string, here after connecting it would have some value
        
    ){
        this.uiExpert = new UIExpert(userId)
        this.context = []
        this.state = {
            screenId: null,
            screenIdByTaskId: new Map(),
            lastTestErrors: [],
            lastToolResult: null,
            lastError: null,
            errorsByTaskId: new Map(),
        }
    }

    
    generateScreenId(todo: PlannerTodo): string {
    return `screen_${todo.id}_${Date.now()}`
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

    async Orchestrate(userPrompt: string, answers?: Answers[]): Promise<OrchestratorResponse>{

        const data: BootstrapResponse = await this.Bootstrap(userPrompt, answers);

        this.sandboxId = await this.sandbox.StartSandbox(this.userId, this.projectId, this.sandboxId)

        const user = await axios.get<User>(`${BACKEND_URL}/get/user/${this.userId}`)

        const project = await axios.get<Project>(`${BACKEND_URL}/get/projects/${this.userId}/${this.projectId}`)
        
        let orchestratorSummary: string = ""
        if(!data.isComplex){
            // do planning stuff in main agent system prompt itself.
            const mainAgent: MainAgent = new MainAgent(userPrompt, this.userId, this.projectId, user.data.semanticMem, project.data.sessions, project.data.context, this.sandboxId)

            const mainResult = await mainAgent.runLoop()
            orchestratorSummary = mainResult.summary
            // trigger evals
            // trigger deploy pipeline.
            // and then epilouge.
        }
        else{
            const tasks: PlannerTodo[] = await b.PlanComplexTask(PLAN_TASK_SYSTEM_PROMPT, data.userPrompt)
            
            const dag: DAG = new DAG(tasks)
            const sequentialTodos: PlannerTodo[] = dag.TopologicalSort()
            let summaries: string[] = []

            const inputBuilders: InputBuilders = {
                coder: (todo, ctx, state) => ({
                    task: {
                        taskId: todo.id,
                        task: todo.task,
                        dependentTasks: todo.dependency,
                        agentType: 'coder',
                        agentSpecificData: {
                            relatedDesignRef: state.screenId ? { screenId: state.screenId } : undefined,
                        },
                    },
                    agentType: 'coder',
                }),

                uiExpert: (todo, ctx, state) => ({
                    task: {
                    taskId: todo.id,
                    task: todo.task,
                    dependentTasks: todo.dependency,
                    agentType: 'uiExpert',
                    agentSpecificData: {
                        screenId: state.screenId ?? this.generateScreenId(todo),
                        mode: state.screenId ? 'update' : 'create',
                        referenceScreenIds: Array.from(state.screenIdByTaskId.values()),
                    },
                    },
                    query: "",
                    agentType: 'uiExpert',
                }),

                tester: (todo, ctx, state) => ({
                    task: {
                        taskId: todo.id,
                        task: todo.task,
                        dependentTasks: todo.dependency,
                        agentType: 'tester',
                        agentSpecificData: {},
                    },
                    agentType: 'tester',
                }),

                debuggerr: (todo, ctx, state) => {
                    if(!this.state.lastToolResult){
                        throw new Error(`debuggerr builder called without last tool result`)
                    }
                    const toolResult = this.state.lastToolResult
                    return {
                        task: {
                            taskId: todo.id,
                            task: todo.task,
                            dependentTasks: todo.dependency,
                            agentType: 'debuggerr',
                            agentSpecificData: {},
                        },
                        agentType: 'debuggerr',
                        errors: state.lastTestErrors,
                        toolResult: toolResult,
                    }
                },

                researcher: (todo, ctx, state) => ({
                    task: {
                        taskId: todo.id,
                        task: todo.task,
                        dependentTasks: todo.dependency,
                        agentType: 'researcher',
                        agentSpecificData: {
                            query: todo.task,
                            maxResults: 5,
                        },
                    },
                    agentType: 'researcher',
                }),
                }
    
            for(let i = 0 ; i < sequentialTodos.length; i++){
                // guardrail for the todo to ne not null
                const todo = sequentialTodos[i];
                if (!todo?.agent) continue;

                const agentType = todo?.agent
                
                const input = inputBuilders[agentType](todo, this.context, this.state)
                
                const subagent = new SubAgent(agentType, input, this.userId, this.projectId, this.sandboxId, user.data.semanticMem)

                const result = await subagent.runLoop()
                summaries.push(result.summary)
                let testsPassing: boolean | null = null;
                let lastErrors = null

                if (agentType === "coder") {
                    testsPassing = false;
                    let loopCount = 0;

                    while (loopCount < DEBUGGERR_MAX_ITERATIONS && !testsPassing) {
                        const tester = new SubAgent('tester', "", this.userId, this.projectId, this.sandboxId, user.data.semanticMem )

                        const testerRes: TesterResponse = await tester.Test()
                        if(testerRes.success === true){
                            testsPassing = true
                        }
                        else{
                            const error: Error = {
                                fileName: testerRes.errorRes!.file,
                                error: testerRes.errorRes!.error + testerRes.errorRes!.line
                            }
                            this.state.lastTestErrors.push(error)

                            const debugTodo: PlannerTodo = {
                                task: "",
                                id: Math.floor(Math.random() * 1000), // debugger task starting from 1000 id number.
                                dependency: [],
                                agent: 'debuggerr',
                                status: 'pending'
                            }
                            const debuggerInput = inputBuilders['debuggerr'](debugTodo, this.context, this.state)
                            const debuggerAgent = new SubAgent('debuggerr', debuggerInput, this.userId, this.projectId, this.sandboxId, user.data.semanticMem)
                            const debuggerResult = await debuggerAgent.runLoop()
                            this.state.lastToolResult = {
                                success: debuggerResult.success,                                
                            }
                            summaries.push(debuggerResult.summary)
                            lastErrors = error
                        }
                        loopCount++;
                    }
                }

                this.context.push({
                    taskId: todo.id,
                    task: todo.task,
                    agentAssigned: agentType,
                    summary: result.summary,
                    success: true
                });

                this.emitSSEUpdate({
                    taskCompleted: `Task ${todo.task} completed`,
                    status: testsPassing === false ? "failed" : "success",
                    summary: result.summary,
                    errors: testsPassing === false ? lastErrors : null,
                });
                }
                orchestratorSummary = await this.GenerateSubagentSummary(summaries)
                
            }
            // trigger deploy pipeline
            
        }
    

    // -------------Everything below is for subagents ----------------
    shouldBatchTest(completedTaskIds: number[], dagState: DAG): boolean {
        // TODO: implement DAG-based batching — test after independent task groups complete,
        // not after every single coder task. Stubbed for now, always returns true (test every time).
        return true
    }
    async emitSSEUpdate(event: OrchestratorSSE){
        await axios.post(`${BACKEND_URL}/internal/sessions/${this.projectId}/events`, event)
    }
    async GenerateSubagentSummary(summaries: string[]): Promise<string>{
        return await b.OrchestratorSummary(ORCHESTRATOR_SUMMARY_PROMPT, summaries)
    }
    // that tester <-> debugger loop
    
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