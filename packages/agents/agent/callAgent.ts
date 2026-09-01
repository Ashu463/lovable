import { Inngest } from "inngest"
import type { CallAgentResponse, CallAgentSSE, Project, User, Answers, BootstrapResponse, DesignOption, UIPreferenceQA, UIPreferenceQuestion } from "../types/callAgentTypes"
import { E2BSandbox } from "./utils/sandbox"
import { b } from "../baml_client"
import {type Error, type Question, type PlannerTodo, type ToolResult} from '../baml_client/types'
import { COMPLEXITY_CHECKER_PROMPT, CLARIFICATION_PROMPT, UI_PREFERENCE_PROMPT, DEVELOPMENT_GATE_PROMPT, CONVERSATIONAL_REPLY_PROMPT } from "./config/systemPrompts"
import { Agent } from "./agent"
import { PROJECT_ROOT } from "./config/systemConfig"
import { Orchestrator, type StepRunner } from "./orchestrator"
import { UIExpert } from "./subagents/uiExpert"
import type { SubAgentType } from "../types/subAgentsTypes"
import { deployReactApp, type DeploymentResult } from "./MCPs/vercel"
import { createRunEmitter, type EventEmitter } from "./events"
import { backendGql } from "./utils/backendClient"
import { summarizeIncompleteSession } from "./utils/priorRunSummary"
import { logger } from "./utils/logger"
import { SkillStore } from "./skills"
import {observe} from '@langfuse/tracing'

export type CallAgentContext = {
    taskId: number,
    task: string,
    agentAssigned: SubAgentType,
    success: boolean,
    summary: string,
}
export type CallAgentState = {
    lastTestErrors: Error[]
    lastToolResult: ToolResult | null
    lastError: Error | null
}


export class CallAgent{
    private uiExpert: UIExpert
    private context: CallAgentContext[]
    private lastRunSummary: string = ""
    private selectedDesign: string = ""
    private uiPreferences: UIPreferenceQA[] = []
    private emitter: EventEmitter
    private skillStore: SkillStore = new SkillStore()
    private isComplex: boolean
    constructor(
        public userId: string,
        public projectId: string,
        public sandbox: E2BSandbox, // initially pass this as empty string, here after connecting it would have some value
        public runId: string,
        public semanticMem: string,
    ){
        this.uiExpert = new UIExpert(userId, projectId, sandbox, PROJECT_ROOT)
        this.emitter = createRunEmitter(runId)
        this.context = []
    }

    async Bootstrap(userPrompt: string): Promise<BootstrapResponse>{
        let complexity: boolean = false
        logger.info(`Starting to fetch qeustions and designs`)
        const bootstrap = await backendGql<{
            questions: {question: string, options: string[]}[],
            designs: {id: string, htmlContent: string, isSelected: boolean}[],
            project: {isComplex: boolean | null},
            currentUIPreferences: {questionText: string, answer: string}[],
            uiPreferenceQuestions: UIPreferenceQuestion[],
            answers: Answers[]
        }>(
            `query Bootstrap($projectId: ID!) {
                questions(projectId: $projectId) { question options }
                designs(projectId: $projectId) { id htmlContent isSelected }
                project(id: $projectId) { isComplex }
                currentUIPreferences(projectId: $projectId) { questionText answer }
                uiPreferenceQuestions(projectId: $projectId) { id question options }
                answers: answeredQuestions(projectId: $projectId) { question: questionText answer }
            }`,
            { projectId: this.projectId }
        )
        const questions: Question[] = bootstrap.questions.map((q) => ({question: q.question, option: q.options}))
        const designs = bootstrap.designs
        const cachedIsComplex = bootstrap.project.isComplex
        const answers = bootstrap.answers
        logger.info(`Fetched ${questions.length} saved question(s) and ${designs.length} saved design(s)`)
        // Unanswered ones first, same as the UI preference gate below: a round
        // is still outstanding, so re-ask it rather than spending another
        // clarification call on a prompt we already know is ambiguous.
        if(questions.length > 0){
            logger.info(`Reusing previously generated questions, skipping complexity/clarification checks`)
            return {
                status: 'clarification_needed',
                questions: questions,
                alreadySaved: true
            }
        }
        // Answers now come from the DB, not the job payload, so they survive
        // every later round — a UI preference pause no longer loses them.
        else if(answers.length > 0){
            logger.info(`Folding ${answers.length} previously answered question(s) into the prompt`)
            const qa = answers
                .map((ans) => `- ${ans.question}\n  Answer: ${ans.answer}`)
                .join('\n')
            userPrompt += `\n\nThe user was asked clarifying questions and answered:\n${qa}`
            complexity = cachedIsComplex ?? false
        }
        else{
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

        if(complexity){
            logger.info(`Complex task — skipping single-design selection`)

            // Unanswered ones come first: a partially answered set still needs
            // the rest before any UIExpert task can run.
            if(bootstrap.uiPreferenceQuestions.length > 0){
                logger.info(`Reusing ${bootstrap.uiPreferenceQuestions.length} previously asked UI preference question(s), still awaiting answers`)
                return { status: 'ui_preference_needed', questions: bootstrap.uiPreferenceQuestions, alreadySaved: true }
            }
            else if(bootstrap.currentUIPreferences.length > 0){
                this.uiPreferences = bootstrap.currentUIPreferences.map((p) => ({question: p.questionText, answer: p.answer}))
                logger.info(`Loaded ${this.uiPreferences.length} answered UI preference(s) for project ${this.projectId}`)
            }
            else{
                let uiQuestions: Question[]
                try{
                    logger.info(`Running UI preference checker`)
                    uiQuestions = await b.GenerateUIPreferenceQuestions(UI_PREFERENCE_PROMPT, userPrompt)
                }
                catch(e){
                    logger.error(`Failed UI preference checker ${e}`)
                    uiQuestions = []
                }
                if(uiQuestions.length > 0){
                    const saved = await backendGql<{saveUIPreferenceQuestions: UIPreferenceQuestion[]}>(
                        `mutation SaveUIPreferenceQuestions($projectId: ID!, $runId: ID!, $questions: [PlannedQuestionInput!]!) {
                            saveUIPreferenceQuestions(projectId: $projectId, runId: $runId, questions: $questions) { id question options }
                        }`,
                        { projectId: this.projectId, runId: this.runId, questions: uiQuestions.map(q => ({question: q.question, option: q.option})) }
                    )
                    return { status: 'ui_preference_needed', questions: saved.saveUIPreferenceQuestions, alreadySaved: true }
                }
            }

            return {
                status: 'pass',
                isComplex: complexity,
                updatedPrompt: userPrompt,
                questions: questions,
                selectedDesign: ""
            }
        }

        let designsHtml: { html: string, prompt: string }[] = []
        if(designs.length === 0){
            logger.info(`Generating designs`)
            try{
                const uiExpertSkills = [
                    ...(await this.skillStore.globalSkills('uiExpert')),
                    ...(await this.skillStore.getRoleSkills('uiExpert')),
                    ...(await this.skillStore.getTaskSkillsFull('uiExpert')),
                ]
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

    private async loadProjectContext(): Promise<void> {
        try {
            const res = await backendGql<{
                projectTaskSummaries: { summary: string, todo: { taskId: number, task: string, agent: SubAgentType } }[],
                lastRunNarrativeSource: { summary: string | null, incompleteSessionSnapshot: string | null },
            }>(
                `query ProjectContext($projectId: ID!) {
                    projectTaskSummaries(projectId: $projectId) { summary todo { taskId task agent } }
                    lastRunNarrativeSource(projectId: $projectId) { summary incompleteSessionSnapshot }
                }`,
                { projectId: this.projectId }
            )
            this.context = res.projectTaskSummaries.map((s) => ({
                taskId: s.todo.taskId, task: s.todo.task, agentAssigned: s.todo.agent, success: true, summary: s.summary,
            }))

            const source = res.lastRunNarrativeSource
            if (source.summary) {
                this.lastRunSummary = source.summary
            } else if (source.incompleteSessionSnapshot) {
                this.lastRunSummary = (await summarizeIncompleteSession(source.incompleteSessionSnapshot)) ?? ""
            }
        } catch(e){
            logger.error(`Failed to load project context for project ${this.projectId}: ${e}`)
        }
    }

    async Execute(userPrompt: string, answers?: Answers[], selectedDesignId?: string, uiPreferences?: Answers[]): Promise<CallAgentResponse>{
        logger.info(`Running call agent`)
        await this.loadProjectContext()

        const taskHistory = this.context.length > 0 ? `\n\nPrior tasks completed on this project:\n${JSON.stringify(this.context)}` : ""
        const priorContext = this.lastRunSummary + taskHistory

        if(!answers && !selectedDesignId && !uiPreferences){
            let verdict: { isDevelopment: boolean }
            try{
                verdict = await b.CheckIsDevelopmentRequest(DEVELOPMENT_GATE_PROMPT, userPrompt)
            }
            catch(e){
                logger.error(`Development gate check failed, defaulting to development: ${e}`)
                verdict = { isDevelopment: true }
            }
            if(!verdict.isDevelopment){
                logger.info(`Message judged conversational, skipping the build pipeline`)
                let reply: string
                try{
                    const conversational = await b.RespondConversationally(CONVERSATIONAL_REPLY_PROMPT, userPrompt, priorContext, this.semanticMem)
                    reply = conversational.reply
                }
                catch(e){
                    const reason = `Conversational reply failed: ${e instanceof Error ? e.message : String(e)}`
                    await this.emitter.emit({ type: 'run_failed', error: reason })
                    return { status: 'error', reason }
                }
                try{
                    await backendGql(
                        `mutation SaveRunSummary($runId: ID!, $summary: String!) {
                            saveRunSummary(runId: $runId, summary: $summary)
                        }`,
                        { runId: this.runId, summary: reply }
                    )
                } catch(e){
                    logger.error(`Failed to save conversational reply as run summary for run ${this.runId}: ${e}`)
                }

                const result: CallAgentResponse = { status: 'conversation', reply }
                await this.emitter.emit({ type: 'run_completed', result })
                return result
            }
        }

        // this is waste, selected design id is saved to db first then called here. 
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
            data = await this.Bootstrap(userPrompt);
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
        else if(data.status === 'ui_preference_needed'){
            logger.info(`Waiting on UI preference for project ${this.projectId}`)
            await this.emitter.emit({ type: 'ui_preference_needed', questions: data.questions })
            return {
                status: 'ui_preference_needed',
                questions: data.questions
            }
        }
        else if(data.status === 'error'){
            await this.emitter.emit({ type: 'run_failed', error: data.error })
            return {
                status: 'error',
                reason: data.error
            }
        }
        if( data.isComplex === false){

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

        const SimpleEventData: RunEventData = {
            userId: this.userId, 
            projectId: this.projectId, 
            runId: this.runId, 
            sandboxId: this.sandbox.sandboxId,
            semanticMem: this.semanticMem, 
            selectedDesign: this.selectedDesign, 
            updatedPrompt: data.updatedPrompt ?? userPrompt, 
            priorContext
        }
        const complexEventData: RunEventData = {
            userId: this.userId,
            projectId: this.projectId,
            runId: this.runId,
            sandboxId: this.sandbox.sandboxId,
            semanticMem: this.semanticMem,
            updatedPrompt: data.updatedPrompt ?? userPrompt,
            priorContext,
            uiPreferences: this.uiPreferences,
        }
        try{
            logger.info(`Dispatching ${data.isComplex ? 'complex' : 'simple'} run ${this.runId} to Inngest`)
            data.isComplex ? 
            await inngest.send({ name: "callAgent/run.complex", data: complexEventData}) :
            await inngest.send({ name: "callAgent/run.simple", data: SimpleEventData })
        }
        catch(e){
            const reason = `Failed to dispatch run to Inngest: ${e instanceof Error ? e.message : String(e)}`
            await this.emitter.emit({ type: 'run_failed', error: reason })
            return { status: 'error', reason }
        }
        return { status: 'in_progress', runId: this.runId }
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
    // shouldBatchTest, GenerateCallAgentSummary, TesterDebuggerLoop, and
    // preDeployCheck used to live here — they were the complex path's own
    // planning/DAG-loop/tester-debugger machinery, now fully superseded by
    // Orchestrator (which has its own equivalent plan()/runLevel()/
    // runMergeGate()/preDeployCheck internally). Removed rather than kept
    // dead, since nothing calls them anymore.

    async Deploy(path: string): Promise<DeploymentResult>{
        const result = await deployReactApp(path)
        if(result.success) return result
        // #TODO: failure handling and pushing into the tester debugger loop.
        return result
    }
}

// Wiring Inngest to the subagent and agent. 
export const inngest = new Inngest({ id: "lovable-agents" })
type SimpleTask = {
    userId: string, 
    projectId: string, 
    runId: string, 
    sandboxId: string, 
    semanticMem: string,
    selectedDesign: string,
    updatedPrompt: string,
    priorContext: string
}
type ComplexTask = {
    userId: string, 
    projectId: string, 
    runId: string, 
    sandboxId: string, 
    semanticMem: string,
    uiPreferences: UIPreferenceQA[],
    updatedPrompt: string,
    priorContext: string
}
export type RunEventData = SimpleTask | ComplexTask

async function finalizeRun(step: StepRunner, data: RunEventData, summary: string, todos: PlannerTodo[]): Promise<void> {
    const previewUrl: string = await step.run("preview-url", async () => {
        const sandbox = await E2BSandbox.StartSandbox(data.userId, data.projectId, data.sandboxId)
        return sandbox.GetPreviewUrl()
    })
    await step.run("save-run-summary", () => backendGql(
        `mutation SaveRunSummary($runId: ID!, $summary: String!) {
            saveRunSummary(runId: $runId, summary: $summary)
        }`,
        { runId: data.runId, summary },
    ).catch((e) => logger.error(`Failed to save run summary for run ${data.runId}: ${e}`)))

    const result: CallAgentResponse = { status: 'completed', previewUrl, summary }
    await step.run("emit-run-completed", () => createRunEmitter(data.runId).emit({ type: 'run_completed', result }))
}

export const runComplexTaskFn = inngest.createFunction(
    { id: "run-complex-task", triggers: [{ event: "callAgent/run.complex" }] },
    async ({ event, step }) => {
        const data = event.data as RunEventData as ComplexTask
        try {
            const orchestrator = new Orchestrator(
                data.userId, data.projectId, data.runId, data.sandboxId,
                data.semanticMem, data.updatedPrompt, data.priorContext, data.uiPreferences,
            )
            const orchestratorResult = await orchestrator.Execute(step)
            if (orchestratorResult.status === 'error') return orchestratorResult

            await finalizeRun(step, data, orchestratorResult.summary ?? "", orchestratorResult.todos ?? [])
            return orchestratorResult
        } catch (e) {
            const reason = `Complex run crashed: ${e instanceof Error ? e.message : String(e)}`
            await step.run("emit-run-failed", () => createRunEmitter(data.runId).emit({ type: 'run_failed', error: reason }))
            throw e
        }
    },
)

export const runSimpleTaskFn = inngest.createFunction(
    { id: "run-simple-task", triggers: [{ event: "callAgent/run.simple" }] },
    async ({ event, step }) => {
        const data = event.data as RunEventData as SimpleTask
        try {
            const result = await step.run("agent-run", async () => {
                const sandbox = await E2BSandbox.StartSandbox(data.userId, data.projectId, data.sandboxId)
                await sandbox.EnsureAlive()
                const agent = new Agent(data.updatedPrompt, data.userId, data.projectId, data.runId, data.semanticMem, data.selectedDesign, sandbox, data.priorContext)
                // agent.runLoop()
                const tracedResult = observe(agent.runLoop.bind(agent), {
                    name: `agent-run-for-${data.runId}`,
                    asType: "agent",
                })
                return tracedResult
            }) as { success: boolean, summary: string }

            if (!result.success) {
                const reason = result.summary
                await step.run("emit-run-failed", () => createRunEmitter(data.runId).emit({ type: 'run_failed', error: reason }))
                return { status: 'error' as const, reason }
            }

            await finalizeRun(step, data, result.summary, [])
            return { status: 'completed' as const }
        } catch (e) {
            const reason = `Simple run crashed: ${e instanceof Error ? e.message : String(e)}`
            await step.run("emit-run-failed", () => createRunEmitter(data.runId).emit({ type: 'run_failed', error: reason }))
            throw e
        }
    },
)

export const functions = [runComplexTaskFn, runSimpleTaskFn]

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