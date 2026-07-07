import { CODER_PROMPT } from "../config/sysPrompts";
import {b, type CoderContext, type DeleteFile, type Done, type FetchDocs, type ReadFile, type Research, type RunCommand, type ToolResult, type WriteFile} from '../../baml_client'
import { Researcher } from "./researcher";
import { E2BSandbox } from "../utils/sandbox";
import type { Message } from "../../types/agentTypes";
import { fetchDocs } from "../MCPs/context7";
import { BaseAgent } from "./baseAgent";
import Sandbox from "e2b";

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
type CoderRequest = string // not needed here. 
type CoderLLMResponse = WriteFile | ReadFile | RunCommand | DeleteFile | FetchDocs | Research | Done
type CoderAgentResponse = ToolResult | string
export class CoderAgent extends BaseAgent<CoderRequest, CoderLLMResponse, CoderAgentResponse>{
    constructor(
        userId: string,
        projectId: string,
        sandboxId: string,
        // public prompt: string, // why do you need this? SystemPrompt and boilerPlate is there. isn't it?
        public s3Id?: string,
    ){super(userId, projectId, sandboxId)}

    
    override async callLLM(boilerPlate: string): Promise<CoderLLMResponse> {
        if(this.context.length == 0){ // assuming you won't push to context initially
            return await b.CoderAgent(CODER_PROMPT, boilerPlate, this.context)
        }
        else{
            return await b.CoderAgent(CODER_PROMPT, "", this.context)
        }
    }
    override async executeFunction(response: CoderLLMResponse): Promise<CoderAgentResponse> {
        try{
            if(response.action === 'read' || response.action === 'writeFile' || response.action === 'delete' || response.action === 'runCommand'){
                const sandboxRes: CoderContext = await this.sandbox.Execute(this.sandboxId, response)
            }
            else if(response.action === 'fetchDocs'){
                const fetchInfo: string = await fetchDocs(response.library, response.query)
            }
            else if(response.action === 'research'){
                // const research = await Researcher.Search(response.query, "webSearch")
            }
            else if(response.action === 'done'){
                // const syncToS3 = await sandbox.SyncS3()
                return "coder agent done"
            }
        }
        catch(e){
            throw new Error("Error occurred in coder agent tool call")
        }
        return "Unknown Error occurred"
    }
    // async runLoop(): Promise<WriteFile | RunCommand  | Done>{
    //     const researchAgent: Researcher = new Researcher()
    //     let context: Message[] = []
    //    const sandbox: E2BSandbox = new E2BSandbox(this.sandboxId)
    //    // TODO: intially pushing to the context, make this to fetch from the memory about relevant context.
    //     let response: WriteFile | ReadFile | DeleteFile | RunCommand | FetchDocs | Done | Research
    //     let firstTurn = true;
    //     if(this.s3Id){
    //         // this is not the first turn 
    //         firstTurn = false;
    //     }
    //     else{
    //         this.s3Id = openS3Connection() //
    //     }

    //     // build context - memory lagao 

    //     while(true){

    //         try{
    //             if(firstTurn){
    //                 firstTurn = false
    //             }
    //             else{
    //                 response = await b.CoderAgent(this.prompt, CODER_PROMPT, "", this.context)
    //             }

                
    //         }
    //         catch(e){
    //             throw new Error("Error occurred")
    //         }
    //     }
    // }
}