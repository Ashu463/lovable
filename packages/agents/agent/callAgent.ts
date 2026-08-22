import type { CallAgentResponse, CallAgentSSE, Project, User, Answers, BootstrapResponse, DesignOption } from "../types/callAgentTypes"
import { E2BSandbox } from "./utils/sandbox"
import { b } from "../baml_client"
import {type Error, type Question, type PlannerTodo, type ToolResult} from '../baml_client/types'
import { COMPLEXITY_CHECKER_PROMPT, CLARIFICATION_PROMPT, CALL_AGENT_SUMMARY_PROMPT, PLAN_TASK_SYSTEM_PROMPT} from "./config/systemPrompts"
import { DAG } from "./services/dag"
import { Screen } from "@google/stitch-sdk"
import { Agent } from "./agent"
import { TESTER_DEBUGGER_LOOP_MAX_ITERATIONS, TASK_SANDBOX_RETRY_LIMIT } from "./config/systemConfig"
import { SubAgent } from "./subAgent"
import { UIExpert } from "./subagents/uiExpert"
import type { InputMap, SubAgentType } from "../types/subAgentsTypes"
import { TesterAgent, type TesterResponse } from "./subagents/tester"
import { deployReactApp, type DeploymentResult } from "./MCPs/vercel"
import { createRunEmitter, type EventEmitter, type CallAgentEvent } from "./events"
import { backendGql } from "./utils/backendClient"
import { logger } from "./utils/logger"
import { SkillStore } from "./skills"
import type { TesterContext } from "../baml_client"


type InputBuilder<T extends SubAgentType> = (
    todo: PlannerTodo,
    ctx: CallAgentContext[],
    callAgentState: CallAgentState,
    semanticMem: string,
    updatedPrompt: string
) => InputMap[T]

type InputBuilders = { [K in SubAgentType]: InputBuilder<K> }
export type CallAgentContext = {
    taskId: number,
    task: string,
    agentAssigned: SubAgentType,
    success: boolean,
    summary: string,
}
export type CallAgentState = {
    screenId: string | null // last most scrreen
    screenIdByTaskId: Map<number, string> // taskId (uiExpert) -> screenId, for dependency-specific lookups
    lastTestErrors: Error[]
    lastToolResult: ToolResult | null
    lastError: Error | null
    errorsByTaskId: Map<number, Error[]> // taskId (tester) -> errors, if debugger needs a specific tester's output
}


export class CallAgent{
    private uiExpert: UIExpert
    private context: CallAgentContext[]
    private state: CallAgentState
    private selectedDesign: string = ""
    private emitter: EventEmitter
    private skillStore: SkillStore = new SkillStore()
    constructor(
        public userId: string,
        public projectId: string,
        public sandbox: E2BSandbox, // initially pass this as empty string, here after connecting it would have some value
        public runId: string,
        public semanticMem: string,
        public priorRunSummary: string | null = null,
    ){
        this.uiExpert = new UIExpert(userId, projectId, sandbox)
        this.emitter = createRunEmitter(runId)
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
        coder: (todo, ctx, state, semanticMem) => ({
            task: {
                taskId: todo.id,
                task: todo.task,
                dependentTasks: todo.dependency,
                agentType: 'coder',
                agentSpecificData: {
                    relatedDesignRef: state.screenId ? { screenId: state.screenId } : undefined,
                },
                designNeeded: todo.designNeeded
            },
            callAgentContext: ctx,
            semanticMem: semanticMem,
            agentType: 'coder',
        }),

        uiExpert: (todo, _ctx, state, _semanticMem, updatedPrompt) => ({
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
                designNeeded: todo.designNeeded
            },
            agentType: 'uiExpert',
            updatedPrompt,
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

        debuggerr: (todo, ctx, state, semanticMem) => {
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
                callAgentContext: ctx,
                semanticMem: semanticMem,
                designNeeded: todo.designNeeded,
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
        let complexity: boolean = false
        logger.info(`Starting to fetch qeustions and designs`)
        // graphql power. 3 in 1
        const bootstrap = await backendGql<{
            questions: {question: string, options: string[]}[],
            designs: {id: string, htmlContent: string, isSelected: boolean}[],
            project: {isComplex: boolean | null},
        }>(
            `query Bootstrap($projectId: ID!) {
                questions(projectId: $projectId) { question options }
                designs(projectId: $projectId) { id htmlContent isSelected }
                project(id: $projectId) { isComplex }
            }`,
            { projectId: this.projectId }
        )
        const questions: Question[] = bootstrap.questions.map((q) => ({question: q.question, option: q.options}))
        const designs = bootstrap.designs
        const cachedIsComplex = bootstrap.project.isComplex
        logger.info(`Fetched ${questions.length} saved question(s) and ${designs.length} saved design(s)`)
        const hasRealAnswers = !!answers && answers.length > 0
        const pastClarificationStage = answers !== undefined
        if(hasRealAnswers){
            logger.info(`Answer added to user prompt`)
            const qa = answers!
                .map((ans) => `- ${ans.question}\n  Answer: ${ans.answer}`)
                .join('\n')
            userPrompt += `\n\nThe user was asked clarifying questions and answered:\n${qa}`
            // Complexity was already decided (and cached) before these questions
            // were asked — reuse it rather than assuming complex. Clarification
            // isn't exclusive to the complex path anymore, so answering a
            // question no longer implies anything about complexity.
            complexity = cachedIsComplex ?? false
        }
        else if(!pastClarificationStage && questions.length > 0){
            logger.info(`Reusing previously generated questions, skipping complexity/clarification checks`)
            return {
                status: 'clarification_needed',
                questions: questions,
                alreadySaved: true
            }
        }
        else{
            // Complexity and clarification are independent judgments — two
            // separate calls, not one combined verdict. Complexity runs (or
            // reuses its cache) first so clarification's isComplex param
            // reflects a real decision; clarification always runs after,
            // regardless of what that decision was.
            if(cachedIsComplex !== null && cachedIsComplex !== undefined){
                logger.info(`Reusing cached complexity verdict (${cachedIsComplex}) for project ${this.projectId}, skipping complexity checker LLM call`)
                complexity = cachedIsComplex
            }
            else{
                let complexityVerdict
                try{
                    logger.info(`Running complexity checker`)
                    complexityVerdict = await b.CheckComplexity(COMPLEXITY_CHECKER_PROMPT, userPrompt)
                }
                catch(e){
                    logger.error(`Failed complexity checker ${e}`)
                    return {
                        status: 'error',
                        error: `Error occurred while checking complexity: ${e instanceof Error ? e.message : String(e)}`
                    }
                }
                complexity = complexityVerdict.complex
                logger.info(`Complexity checker result: complex=${complexity}`)
                try{
                    await backendGql(
                        `mutation CacheComplexity($id: ID!, $isComplex: Boolean!) {
                            updateProject(id: $id, isComplex: $isComplex) { id }
                        }`,
                        { id: this.projectId, isComplex: complexity }
                    )
                } catch(e){
                    logger.error(`Failed to cache complexity verdict for project ${this.projectId}: ${e}`)
                }
            }

            let clarifyingQuestions: Question[]
            try{
                logger.info(`Running clarification checker`)
                clarifyingQuestions = await b.GenerateClarifyingQuestions(CLARIFICATION_PROMPT, userPrompt, complexity)
            }
            catch(e){
                logger.error(`Failed clarification checker ${e}`)
                return {
                    status: 'error',
                    error: `Error occurred while checking for clarification: ${e instanceof Error ? e.message : String(e)}`
                }
            }
            if(clarifyingQuestions.length > 0){
                logger.info(`Clarification needed: ${JSON.stringify(clarifyingQuestions)}`)
                // db request should hit isnt't it to save the questions
                return {
                    status: 'clarification_needed',
                    questions: clarifyingQuestions
                }
            }
        }

        let designsHtml: { html: string, prompt: string }[] = []
        if(designs.length === 0 && !complexity){
            logger.info(`Generating designs`)
            try{
                const uiExpertSkills = [
                    ...(await this.skillStore.globalSkills('uiExpert')),
                    ...(await this.skillStore.getRoleSkills('uiExpert')),
                    ...(await this.skillStore.getTaskSkillsFull('uiExpert')),
                ]
                // Stitch takes ~80s for the three variants, so say so up front
                // rather than leaving the UI on a generic "building" spinner.
                await this.emitter.emit({ type: 'designs_generating', count: 3 })
                const generatedDesigns = await this.uiExpert.generateDesigns(userPrompt, this.semanticMem, uiExpertSkills)
                designsHtml = await this.uiExpert.fetchDesigns(generatedDesigns)
            }
            catch(e){
                logger.error(`Failed to generate designs ${e}`)
                return {
                    status: 'error',
                    error: `Error occurred while generating designs: ${e instanceof Error ? e.message : String(e)}`
                }
            }
            // Save right away so the response can hand back real ids — the
            // frontend/caller only ever needs to pass an id around after this,
            // never the full htmlContent again. prompt is saved alongside
            // purely so bad Stitch output can be traced back to what was asked.
            const saved = await backendGql<{saveDesigns: {id: string, htmlContent: string}[]}>(
                `mutation SaveDesigns($projectId: ID!, $designs: [DesignInput!]!) {
                    saveDesigns(projectId: $projectId, designs: $designs) { id htmlContent }
                }`,
                { projectId: this.projectId, designs: designsHtml.map(d => ({ htmlContent: d.html, prompt: d.prompt })) }
            )
            return {
                status: 'select_design',
                designs: saved.saveDesigns.map((d): DesignOption => ({id: d.id, htmlContent: d.htmlContent})),
                alreadySaved: true
            }
        }
        const selectedDesign = designs.find((d) => d.isSelected)
        if(!selectedDesign){
             logger.info(`Reusing previously generated designs, still awaiting selection`)
            return {
                status: 'select_design',
                designs: designs.map((d): DesignOption => ({id: d.id, htmlContent: d.htmlContent})),
                alreadySaved: true
            }
        }
        logger.info(`Screen fetched from db`)
        return {
            status: 'pass',
            isComplex: complexity,
            updatedPrompt: userPrompt,
            questions: questions,
            selectedDesign: selectedDesign.htmlContent
        }
    }
    
    async Execute(userPrompt: string, answers?: Answers[], selectedDesignId?: string): Promise<CallAgentResponse>{
        logger.info(`Running call agent`)
        if(selectedDesignId){
            await backendGql(
                `mutation SelectDesign($projectId: ID!, $designId: ID!) {
                    selectDesign(projectId: $projectId, designId: $designId) { id }
                }`,
                { projectId: this.projectId, designId: selectedDesignId }
            )
        }
        var data;
        try{
            data = await this.Bootstrap(userPrompt, answers);
        }
        catch(e){
            const reason = `Bootstrap failed with error ${e}`
            await this.emitter.emit({ type: 'run_failed', error: reason })
            return {
                status: 'error',
                reason
            }
        }

        if(data.status === 'clarification_needed'){
            if(!data.alreadySaved){
                logger.info(`LLM generated questions, saving them`)
                await backendGql(
                    `mutation SaveQuestions($projectId: ID!, $runId: ID!, $questions: [PlannedQuestionInput!]!) {
                        saveQuestions(projectId: $projectId, runId: $runId, questions: $questions) { id }
                    }`,
                    { projectId: this.projectId, runId: this.runId, questions: data.questions }
                )
            }
            await this.emitter.emit({ type: 'clarification_needed', questions: data.questions })
            return {
                status: 'clarification_needed',
                questions: data.questions
            }
        }
        else if(data.status === 'select_design'){
            logger.info(`Waiting to select design for run ${this.runId}`)
            await this.emitter.emit({ type: 'select_design', designs: data.designs })
            return {
                status: 'select_design',
                designs: data.designs
            }
        }
        else if(data.status === 'error'){
            await this.emitter.emit({ type: 'run_failed', error: data.error })
            return {
                status: 'error',
                reason: data.error
            }
        }
        this.selectedDesign = data.selectedDesign ?? ""
        if (this.selectedDesign) {
            const path = `design/main-${this.projectId}.html`
            const writeRes = await this.sandbox.Execute(this.sandbox.sandboxId, { action: 'writeFile', path, content: this.selectedDesign })
            if (!writeRes.success) {
                logger.warn(`Failed to save selected design to sandbox at ${path}: ${writeRes.content}`)
            }
            await this.sandbox.SyncR2()
        }

        let callAgentSummary: string = ""
        let todos: PlannerTodo[] = []
        if(!data.isComplex){
            // this.context is always empty at this point (it only ever accumulates
            // on the complex/DAG path below), so the prior run's summary is the
            // only real orchestrator-level context a fresh simple-path run has.
            const priorContext = this.priorRunSummary ?? JSON.stringify(this.context)
            const agent: Agent = new Agent(data.updatedPrompt, this.userId, this.projectId, this.runId, this.semanticMem, this.selectedDesign, this.sandbox, priorContext)

            await this.sandbox.EnsureAlive()
            const mainResult = await agent.runLoop()
            if(!mainResult.success){
                return {
                    status: 'error',
                    reason: mainResult.summary
                }
            }
            callAgentSummary = mainResult.summary

        }
        else{
            logger.info(`Given task is complex, generating todos`)
            // this.context is always empty here (only the DAG loop below fills it),
            // so a follow-up's prior run summary is the real signal to plan against.
            const priorContext = this.priorRunSummary ?? JSON.stringify(this.context)
            todos = await b.PlanComplexTask(PLAN_TASK_SYSTEM_PROMPT, data.updatedPrompt, priorContext)

            try{
                await backendGql(
                    `mutation SaveTodos($projectId: ID!, $runId: ID!, $todos: [PlannedTodoInput!]!) {
                        saveTodos(projectId: $projectId, runId: $runId, todos: $todos) { id taskId }
                    }`,
                    { projectId: this.projectId, runId: this.runId, todos }
                )
            } catch(e){
                logger.error(`Failed to save todos for run ${this.runId}: ${e}`)
            }

            const dag: DAG = new DAG(todos)
            let sequentialTodos: PlannerTodo[] = dag.TopologicalSort()
            let parallelTodos = dag.TopologicalSortParallel()
            let it = 0;
            // while(it < parallelTodos.length){

            //     const response = await Promise.allSettled([
            //         // frame the input for the subagent
            //         // copy paste the below logic of spawning subagent here
            //         // and do the run loop call
            //         // I'm still confused how will the run logic works parallely. 
            //         // and I've to do this with git worktrees into the sandbox, IDK how would it done.
            //         // will probably have to resolve the merge conflicts as well. 
            //         // 
            //     ])
            // }
            logger.info(`todos generated and arranged sequentially`)
            let summaries: string[] = []

            sequentialTodos.forEach(t => t.status = 'pending')

            let i = 0
            let sandboxRetries = 0
            while(i < sequentialTodos.length){
                const todo = sequentialTodos[i]!

                if(todo.status !== 'pending'){
                    i++
                    continue
                }

                logger.info(`Task ${todo.id}: ${todo.task}`)
                // #TODO: Failure handling of planner
                if(!todo.agent){
                    logger.warn(`Task ${todo.id} has no agent assigned, stopping DAG execution`)
                    break
                }

                // The previous task may have run past E2B's runtime cap, so the
                // sandbox is checked (and rebuilt from R2) before every spawn.
                await this.sandbox.EnsureAlive()

                const agentType = todo.agent
                const input = this.inputBuilders[agentType](todo, this.context, this.state, this.semanticMem, data.updatedPrompt)
                const subagent = new SubAgent(agentType, input, this.userId, this.projectId, this.runId, this.sandbox, this.selectedDesign)
                logger.info(`Starting runloop for ${agentType} (task ${todo.id})`)
                const result = await subagent.runLoop()

                // A failed task plus a dead sandbox means the sandbox is why it
                // failed — its partial work is gone, so leave the todo pending and
                // redo it whole on the replacement rather than trusting half of it.
                if(!result.success && await this.sandbox.EnsureAlive()){
                    if(++sandboxRetries >= TASK_SANDBOX_RETRY_LIMIT){
                        logger.error(`Task ${todo.id} lost its sandbox ${sandboxRetries} times, giving up`)
                        break
                    }
                    logger.warn(`Sandbox died during task ${todo.id}, retrying it from the start (${sandboxRetries}/${TASK_SANDBOX_RETRY_LIMIT})`)
                    continue
                }
                sandboxRetries = 0

                // R2 is the only thing that outlives the sandbox, so checkpoint the
                // finished task's work before moving to the next one.
                await this.sandbox.SyncR2()

                summaries.push(result.summary)

                try{
                    await backendGql(
                        `mutation SaveTaskSummary($projectId: ID!, $runId: ID!, $taskId: Int!, $summary: String!) {
                            saveTaskSummary(projectId: $projectId, runId: $runId, taskId: $taskId, summary: $summary) { id }
                        }`,
                        { projectId: this.projectId, runId: this.runId, taskId: todo.id, summary: result.summary }
                    )
                } catch(e){
                    logger.error(`Failed to save summary for task ${todo.id} on run ${this.runId}: ${e}`)
                }

                let testsPassing: boolean | null = null;
                let lastErrors = null
                let testResults
                // TODO: Changing the condition to i % no of tasks/2, please bring some good logic for this.
                if (agentType === 'coder') { // #TODO: Make this below loop as batch testing of dependent DAG tasks
                    logger.info(`Starting tester debugger loop`)
                    testsPassing = false;
                    testResults = await this.TesterDebuggerLoop(this.semanticMem, data.updatedPrompt)
                    if(testResults.success) testsPassing = true
                }
                // this.shouldBatchTest()

                this.context.push({
                    taskId: todo.id,
                    task: todo.task,
                    agentAssigned: agentType,
                    summary: result.summary,
                    success: result.success
                });

                todo.status = 'completed'
                i++
            }
            callAgentSummary = await this.GenerateCallAgentSummary(summaries)

        }
        // Start your dev server first (e.g. npm run dev)
        try{
            logger.info(`trying to hit sandbox preview url`)
            const previewUrl = await this.sandbox.GetPreviewUrl()
            logger.info(``)
            const result: CallAgentResponse = {
                status: "completed",
                design: this.selectedDesign,
                todos: data.isComplex ? todos : [],
                previewUrl,
                summary: callAgentSummary,
            };

            try{
                await backendGql(
                    `mutation SaveRunSummary($runId: ID!, $summary: String!) {
                        saveRunSummary(runId: $runId, summary: $summary)
                    }`,
                    { runId: this.runId, summary: callAgentSummary }
                )
            } catch(e){
                logger.error(`Failed to save run summary for run ${this.runId}: ${e}`)
            }

            await this.emitter.emit({ type: 'run_completed', result })
            return result;
        }
        catch(e){
            logger.error(`Error occurred while hosting ${e}`)
            throw new Error
        }
        // Deploy if only user says this explictily
        // #TEST: replace with appropriate path of project directory
        // const deployResult: DeploymentResult = await this.Deploy(`/home/usr/${this.userId}/projects/${this.projectId}`)
        // if(deployResult.success){
        //     return {
        //         status: 'completed',
        //         design: this.selectedDesign,
        //         todos: data.isComplex ? tasks : [],
        //         previewUrl: deployResult.url,
        //         summary: callAgentSummary
        //     }
        // }
        // return{
        //     status: 'error',
        //     reason: `Deployment failed`
        // }
    }
    

    // -------------Everything below is for subagents ----------------
    shouldBatchTest(completedTaskIds: number[], dagState: DAG): boolean {
        // TODO: implement DAG-based batching — test after independent task groups complete,
        // not after every single coder task. Stubbed for now, always returns true (test every time).
        return true
    }
    
    async GenerateCallAgentSummary(summaries: string[]): Promise<string>{
        return await b.CallAgentSummary(CALL_AGENT_SUMMARY_PROMPT, summaries)
    }
    // that tester <-> debugger loop
    async TesterDebuggerLoop(semanticMem: string, updatedPrompt: string = ""): Promise<{success: true | false, summaries: string[], lastError?: Error}>{
        let loopCount = 0;
        let summaries: string[] = []
        let lastError

        let deployReady = await this.preDeployCheck()
        const testerContext: TesterContext = {
            skills: [
                ...(await this.skillStore.globalSkills('tester')),
                ...(await this.skillStore.getRoleSkills('tester')),
                ...(await this.skillStore.getTaskSkillsFull('tester')),
            ],
        }

        try{
            let previousErrorSignature: string | null = null
            let repeatCount = 0
            while (loopCount < TESTER_DEBUGGER_LOOP_MAX_ITERATIONS && !deployReady) {
                const tester = new TesterAgent(this.userId, this.projectId, this.sandbox)

                const testerRes: TesterResponse = await tester.testCodebase(testerContext)
                const error: Error = {
                    fileName: testerRes.errorRes!.file,
                    error: testerRes.errorRes!.error + testerRes.errorRes!.line
                }
                // #CRITICAL: halt only after the debugger has had 2 attempts at the same
                // error signature with no progress, not on the first repeat.
                const currentErrorSignature = `${error.fileName}:${error.error}`
                if(currentErrorSignature === previousErrorSignature){
                    repeatCount++
                    if(repeatCount >= 2){
                        return {
                            success: false,
                            summaries: summaries,
                            lastError: error
                        }
                    }
                }
                else{
                    repeatCount = 0
                }
                previousErrorSignature = currentErrorSignature
                this.state.lastTestErrors.push(error)
    
                const debugTodo: PlannerTodo = {
                    task: "",
                    id: Math.floor(Math.random() * 1000), // debugger task starting from 1000 id number.
                    dependency: [],
                    agent: 'debuggerr',
                    status: 'pending',
                    designNeeded: false
                }
                const debuggerInput = this.inputBuilders['debuggerr'](debugTodo, this.context, this.state, this.semanticMem, updatedPrompt)
                const debuggerAgent = new SubAgent('debuggerr', debuggerInput, this.userId, this.projectId, this.runId, this.sandbox, this.selectedDesign)
                const debuggerResult = await debuggerAgent.runLoop()
                await this.sandbox.SyncR2()
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
            logger.error(`TesterDebuggerLoop failed: ${e}`)
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