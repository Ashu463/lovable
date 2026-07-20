import { CODER_PROMPT } from "../config/sysPrompts";
import {b, type CoderContext, type DeleteFile, type Done, type EditFile, type FetchDocs, type Message, type ReadFile, type Research, type ResearcherResponse, type RunCommand, type ToolResult, type WriteFile} from '../../baml_client'
import { Researcher } from "./researcher";
import { E2BSandbox } from "../utils/sandbox";
import { fetchDocs } from "../MCPs/context7";
import { BaseAgent } from "./baseAgent";
import type { CoderTaskInput } from "../../types/subAgentsTypes";

type CoderLLMResponse = WriteFile | EditFile | ReadFile | RunCommand | DeleteFile | FetchDocs | Research | Done
type CoderAgentResponse = {
    success: boolean,
    response: string,
    toolResult?: ToolResult
}
export class CoderAgent extends BaseAgent<CoderTaskInput, CoderContext, CoderLLMResponse, CoderAgentResponse>{

    private researcher: Researcher
    constructor(
        userId: string,
        projectId: string,
        sandbox: E2BSandbox,
        private selectedDesign: string,
        // public prompt: string, // why do you need this? SystemPrompt and boilerPlate is there. isn't it?
    ){super(userId, projectId, sandbox)
        this.researcher = new Researcher(this.userId, this.projectId, this.sandbox)
    }


    override async callLLM(input: CoderTaskInput, context: CoderContext): Promise<CoderLLMResponse> {
        const relatedDesignRef = (input.task.agentSpecificData as { relatedDesignRef?: { screenId: string } }).relatedDesignRef
        const figmaBoilerPlate = relatedDesignRef ? `Reference design screen: ${relatedDesignRef.screenId}` : undefined
        return await b.CoderAgent(CODER_PROMPT, figmaBoilerPlate, context)
    }
    override async executeFunction(response: CoderLLMResponse): Promise<CoderAgentResponse> {
        try{
            if(
                response.action === 'read' 
                || response.action === 'writeFile' 
                || response.action === 'delete' 
                || response.action === 'runCommand'
                // || response.action === 'editFile' #TODO: EDIT FILE
            ){
                const sandboxRes = await this.sandbox.Execute(this.sandbox.sandboxId, response)
                return {
                    success: true, 
                    response: sandboxRes.content 
                }
            }
            else if(response.action === 'research'){
                let researchResponse: string = ""
                if(response.searchType.type === 'webSearch'){
                    researchResponse = await this.researcher.WebSearch(response.searchType.query, response.searchType.maxResults)
                }
                else if(response.searchType.type === 'webScrape'){
                    researchResponse = await this.researcher.WebScrape(response.searchType.urls, response.searchType.maxPages)
                }
                else if(response.searchType.type === 'docsSearch'){
                    researchResponse = await fetchDocs(response.searchType.library, response.searchType.query)
                }
                else{
                    throw new Error("Invalid research type")
                }
                return {
                    success: true,
                    response: researchResponse
                }
            }
            else if(response.action === 'done'){
                // const syncToS3 = await sandbox.SyncS3()
                return {
                    success: true,
                    response: `Coder Agent completed it's work`
                }
            }
        }
        catch(e){
            throw new Error("Error occurred in coder agent tool call")
        }
        return {
            success: false,
            response: "Unknown Error occurred"
        }
    }
}

/* Steps: 
- Make connection to the db
- if this user exists then 
- create a new user
- prismaService.create(), .update() and so on 
- if this is a new user then, then spin a new sandbox and save it's userId and sessionId with mapping s3Id to it
- else fetch the userId, and complete s3 data stored and load that in sandbox.

- Coder recieved the design, sandboxId to connect with it. 
    Note that, I've opened the fresh sandbox incase this is fresh new request. 
    else resume the sandbox by loading all the files from s3.

- Now Coder run inside sandbox and that will have some code present in it.

*/