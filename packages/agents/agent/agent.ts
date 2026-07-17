import type { OrchestratorResponse, OrchestratorSSE, Project, User, Answers, BootstrapResponse } from "../types/agentTypes"
import { E2BSandbox } from "./utils/sandbox"
import { b } from "../baml_client"
import {type ComplexityLevel, type Error, type Question, type PlannerTodo, type ToolResult} from '../baml_client/types'
import { COMPLEXITY_CHECKER_AND_QUESTION_GENERATOR_PROMPT, ORCHESTRATOR_SUMMARY_PROMPT, PLAN_TASK_SYSTEM_PROMPT} from "./config/sysPrompts"
import { DAG } from "./services/dag"
import { Screen } from "@google/stitch-sdk"
import axios from 'axios'
import { MainAgent } from "./mainAgent"
import { BACKEND_URL, DEBUGGERR_MAX_ITERATIONS } from "./config/systemConfig"
import { SubAgent } from "./subAgent"
import { UIExpert } from "./subagents/uiExpert"
import type { InputMap, SubAgentType } from "../types/subAgentsTypes"
import type { TesterResponse } from "./subagents/tester"
import { deployReactApp, type DeploymentResult } from "./MCPs/vercel"
import { createBackendEmitter, type EventEmitter, type OrchestratorEvent } from "./events"


type InputBuilder<T extends SubAgentType> = (
    todo: PlannerTodo, 
    ctx: OrchestratorContext[],
    orchestratorState: OrchestratorState
) => InputMap[T]

type InputBuilders = { [K in SubAgentType]: InputBuilder<K> }
type OrchestratorContext = {
    taskId: number,
    task: string, 
    agentAssigned: SubAgentType, 
    success: boolean, 
    summary: string,
}
type OrchestratorState = {
    screenId: string | null // last most scrreen
    screenIdByTaskId: Map<number, string> // taskId (uiExpert) -> screenId, for dependency-specific lookups
    lastTestErrors: Error[]
    lastToolResult: ToolResult | null
    lastError: Error | null
    errorsByTaskId: Map<number, Error[]> // taskId (tester) -> errors, if debugger needs a specific tester's output
}


export class OrchestratorAgent{
    private uiExpert: UIExpert
    private context: OrchestratorContext[]
    private state: OrchestratorState
    private selectedDesign: string = ""
    constructor(
        public userId: string, 
        public projectId: string,
        public sandbox: E2BSandbox, // initially pass this as empty string, here after connecting it would have some value
        public runId: string,
        public semanticMem: string
    ){
        this.uiExpert = new UIExpert(userId, projectId, sandbox)
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

    inputBuilders: InputBuilders = {
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

    async Bootstrap(userPrompt: string, answers?: Answers[]): Promise<BootstrapResponse>{
        // I've to store the state somewhere. Probably in backend/db? What say? Just fetch from the backend normally
        // const isComplex: ComplexityLevel = await b.CheckComplexity(userPrompt, COMPLEXITY_CHECKER_PROMPT)
        let isComplex
        let complexity: boolean = false
        // const {data: questions } = await 

        let [questionRes, designRes] = await Promise.all([
            axios.get<Question[]>(`${BACKEND_URL}/db/${this.runId}/getQuestions`),
            axios.get<Screen[]>(`${BACKEND_URL}/db/${this.runId}/getDesigns`)
        ])
        if(answers){
            userPrompt += `Answers for these ${questionRes.data} are: ${answers}`
            answers.map((ans) => userPrompt += ans)
            complexity = true
        }
        else{
            try{
                isComplex = await b.CheckComplexityAndGenerateQuestions(COMPLEXITY_CHECKER_AND_QUESTION_GENERATOR_PROMPT, userPrompt)
            }
            catch(e){
                console.error(e)
                return {
                    status: 'error',
                    error: `Error occurred while checking complexity: ${e instanceof Error ? e.message : String(e)}`
                }
            }
            complexity = isComplex.complex
            if(!isComplex){
                return {
                    status: 'error',
                    error: `Error occurred while generating`
                }
            }
            if(isComplex.complex){
                // db request should hit isnt't it to save the questions 
                return {
                    status: 'clarification_needed',
                    questions: isComplex.questions
                }
            }
        }
        
        let designsHtml: string[] = []
        if(designRes.data.length === 0){
            const designs = await this.uiExpert.generateDesigns(userPrompt, this.semanticMem)
            designsHtml = await this.uiExpert.fetchDesigns(designs)
            return {
                status: 'select_design',
                designs: designsHtml
            }
        }
        const { data: screen } = await axios.get<Screen>(`${BACKEND_URL}/db/${this.runId}/getSelectedDesign`)

        return {
            status: 'pass',
            isComplex: complexity,
            updatedPrompt: userPrompt,
            questions: questionRes.data.length > 0 ? questionRes.data : [],
            selectedDesign: screen
        }
    }

    async Orchestrate(userPrompt: string, answers?: Answers[], design?: string): Promise<OrchestratorResponse>{

        const data = await this.Bootstrap(userPrompt, answers);

        if(data.status === 'clarification_needed'){
            // or save questions to db here? 
            return {
                status: 'clarification_needed',
                questions: data.questions
            }
        }
        else if(data.status === 'select_design'){
            // save design to the db 
            return {
                status: 'select_design',
                designs: data.designs
            }
        }
        else if(data.status === 'error'){
            return {
                status: 'error',
                reason: data.error
            }
        }
        if(!design){
            const { data: fetchedDesign } = await axios.get<string>(`${BACKEND_URL}/${this.projectId}/designs/selected`)
            design = fetchedDesign
        }
        this.selectedDesign = design

        let orchestratorSummary: string = ""
        let tasks: PlannerTodo[] = []
        if(!data.isComplex){
            const mainAgent: MainAgent = new MainAgent(userPrompt, this.userId, this.projectId, this.runId, this.semanticMem, this.selectedDesign, this.sandbox, this.context)

            const mainResult = await mainAgent.runLoop()
            orchestratorSummary = mainResult.summary
            
        }
        else{
            tasks = await b.PlanComplexTask(PLAN_TASK_SYSTEM_PROMPT, data.updatedPrompt, JSON.stringify(this.context))
            
            const dag: DAG = new DAG(tasks)
            const sequentialTodos: PlannerTodo[] = dag.TopologicalSort()
            let summaries: string[] = []

            for(let i = 0 ; i < sequentialTodos.length; i++){
                const todo = sequentialTodos[i];
                // #TODO: Failure handling of planner
                if (!todo?.agent){
                    console.warn(`This ${todo} is not assigned with any agent.`)
                    break;
                }

                const agentType = todo?.agent
                const input = this.inputBuilders[agentType](todo, this.context, this.state)
                
                const subagent = new SubAgent(agentType, input, this.userId, this.projectId, this.sandbox, this.semanticMem, this.selectedDesign)

                const result = await subagent.runLoop()
                summaries.push(result.summary)

                let testsPassing: boolean | null = null;
                let lastErrors = null
                let testResults

                if (agentType === 'coder') { // #TODO: Make this below loop as batch testing of dependent DAG tasks
                    testsPassing = false;
                    testResults = await this.TesterDebuggerLoop(this.semanticMem)
                    if(testResults.success) testsPassing = true
                }
                // this.shouldBatchTest()

                this.context.push({
                    taskId: todo.id,
                    task: todo.task,
                    agentAssigned: agentType,
                    summary: result.summary,
                    success: true
                });
            }
            // FIX: this.state/context in place of summaries.
            orchestratorSummary = await this.GenerateOrchestratorSummary(summaries)
                
        }
        // const path = this.sandbox
        // #TEST: replace with appropriate path of project directory
        const deployResult: DeploymentResult = await this.Deploy(`/home/usr/${this.userId}/projects/${this.projectId}`)
        if(deployResult.success){
            return {
                status: 'completed',
                design: design,
                todos: data.isComplex ? tasks : [],
                previewUrl: deployResult.url,
                summary: orchestratorSummary
            }
        }
        return{
            status: 'error',
            reason: `Deployment failed`
        }
    }
    

    // -------------Everything below is for subagents ----------------
    shouldBatchTest(completedTaskIds: number[], dagState: DAG): boolean {
        // TODO: implement DAG-based batching — test after independent task groups complete,
        // not after every single coder task. Stubbed for now, always returns true (test every time).
        return true
    }
    async emitSSEUpdate(event: OrchestratorEvent){
        await createBackendEmitter(this.runId).emit(event)
    }
    async GenerateOrchestratorSummary(summaries: string[]): Promise<string>{
        return await b.OrchestratorSummary(ORCHESTRATOR_SUMMARY_PROMPT, summaries)
    }
    // that tester <-> debugger loop
    async TesterDebuggerLoop(semanticMem: string, ): Promise<{success: true | false, summaries: string[], lastError?: Error}>{
        let loopCount = 0;
        let summaries: string[] = []
        let lastError

        let deployReady = await this.preDeployCheck()

        try{
            let previousErrorSignature: string | null = null
            while (loopCount < DEBUGGERR_MAX_ITERATIONS && !deployReady) {
                const tester = new SubAgent('tester', "", this.userId, this.projectId, this.sandbox, semanticMem, this.selectedDesign)
    
                const testerRes: TesterResponse = await tester.Test()
                const error: Error = {
                    fileName: testerRes.errorRes!.file,
                    error: testerRes.errorRes!.error + testerRes.errorRes!.line
                }
                // #CRITICAL: trying to avoid those iterations where debugger shows no progress.
                const currentErrorSignature = `${error.fileName}:${error.error}`
                if(currentErrorSignature === previousErrorSignature){
                    return {
                        success: false,
                        summaries: summaries,
                        lastError: error
                    }
                }
                previousErrorSignature = currentErrorSignature
                this.state.lastTestErrors.push(error)
    
                const debugTodo: PlannerTodo = {
                    task: "",
                    id: Math.floor(Math.random() * 1000), // debugger task starting from 1000 id number.
                    dependency: [],
                    agent: 'debuggerr',
                    status: 'pending'
                }
                const debuggerInput = this.inputBuilders['debuggerr'](debugTodo, this.context, this.state)
                const debuggerAgent = new SubAgent('debuggerr', debuggerInput, this.userId, this.projectId, this.sandbox, semanticMem, this.selectedDesign)
                const debuggerResult = await debuggerAgent.runLoop()
                this.state.lastToolResult = {
                    success: debuggerResult.success,                                
                }
                summaries.push(debuggerResult.summary)
                lastError = error
                // if(testerRes.success === true){
                //     testsPassing = true
                // }
                // else{
                // }
                deployReady = await this.preDeployCheck()
                loopCount++;
            }
            return {
                success: true,
                summaries: summaries, 
                lastError: lastError
            }
        }
        catch(e){
            console.error(e)
            return{
                success: false,
                summaries,
            }
        }
    }

    async preDeployCheck(): Promise<boolean> {
        const buildResult = await this.sandbox.Execute(this.sandbox.sandboxId, {action: 'runCommand', command: 'npm run build'})

        if (buildResult.success === false) {
            this.state.lastTestErrors.push({
                fileName: "BUILD_CHECKER_ERROR",
                error: buildResult.stderr ?? `Unknown build error`
            })
            this.state.lastToolResult = {success: false}
            return false
        }
        return true
    }

    async Deploy(path: string): Promise<DeploymentResult>{
        const result = await deployReactApp(path)
        if(result.success) return result
        // #TODO: failure handling and pushing into the tester debugger loop.
        return result
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


do you think that I restricted the creativity of subagents by limiting it's response to certain form of outputs? since I was seeing this as coder wants to return some other type response format but I'm saying no you have to explicitly return in this form. Secondly, am I assuming the right set of output schema, that coder would need to do only these actions, listed everything below: 

Coder -> WriteFile | ReadFile | RunCommand | DeleteFile | FetchDocs | Research | Done

Debugger -> ReadFile | RunCommand | WriteFile | Research | DebuggingDone

Main agent -> type ToolType, apify Apify?, context7 Context7?, tavily Tavily?, stitch StitchTool?, readFile ReadFile?, writeFile WriteFile?, editFile EditFile?, runCommand RunCommand?, deleteFile DeleteFile? Also I was thinking that should subagent's (coder and debugger) system prompt include MCP tools and the normal tools? 

To your questions: You're right with your initial thought of main agent correcting and verifying itself with the available tools and MCPs, not through separate tester/debugger agent.  

yeah three design step happens for the very first time of initiating the chat; once the design is chosen by user then no matter in how many follow ups by user, it will be fixed and will never call to re design again. 

I mean that's what I want to decide right now, should I run complexity checker every time? I think I should coz it totally make sense to me to check complexity of whatever the user have been prompted, the only thing I have to maintain context for orchestrator itself; and inject that context into respective main agent or subagents right? 

Right now research is having very limited scope, web searching or web scraping; but later I thought to add RAG in this that's why did it like this. That's why FetchDocs is made as separated thing to call simple context7 MCP. 
*/