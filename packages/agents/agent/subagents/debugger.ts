import type { WriteFile, ReadFile, RunCommand, Research, Done, Error, DebuggingDone, ToolResult, FileEdit, Message, DebuggerContext, EditFile, DocsSearch } from "../../baml_client";
import { BaseAgent } from "./baseAgent";
import { b } from "../../baml_client";
import { DEBUGGER_PROMPT } from "../config/sysPrompts";
import { Researcher } from "./researcher";
import { fetchDocs } from "../MCPs/context7";
import { webScrape } from "../MCPs/apify";
import type { E2BSandbox } from "../utils/sandbox";

export interface DebuggerAgentResponse{
    success: boolean,
    editedFiles?: FileEdit[] | string,
    toolResult?: string
    // errorsFixed: Error[]
}
type DebuggerRequest = {
  errors: Error[];
  toolResult?: ToolResult;
};
// TODO: implement line by line edit feature, instead writing complete file 
type DebuggerLLMResponse = ReadFile | RunCommand | WriteFile | EditFile | DebuggingDone | Research

// type DebuggerToolResponse = 
export class DebuggerAgent extends BaseAgent<DebuggerRequest, DebuggerContext, DebuggerLLMResponse, DebuggerAgentResponse>{

    private researcher: Researcher 
    constructor(
        userId: string,
        projectId: string,
        sandbox: E2BSandbox

    ){super(userId, projectId, sandbox)
        this.researcher = new Researcher(this.userId, this.projectId, this.sandbox)
    }


    override async callLLM(content: DebuggerRequest, context: DebuggerContext): Promise<DebuggerLLMResponse> {
        
        try{
            const response = await b.DebuggerAgent(DEBUGGER_PROMPT, content.errors, context, content?.toolResult)

            return response
        }
        catch(e){
            throw new Error(`Debugger call failed: ${e instanceof Error ? e.message : String(e)}`)
        }
    }
    override async executeFunction(response: DebuggerLLMResponse): Promise<DebuggerAgentResponse | null> {
        // research agent call
        
        if(response.action === 'read' || 
            response.action === 'writeFile' || 
            response.action === 'runCommand'
            // response.action === 'editFile' #TODO: Edit file in sandbox.
        ){
            const sandboxRes = await this.sandbox.Execute(this.sandbox.sandboxId, response)
            return {
                success: true,
                editedFiles: sandboxRes.content
            }
        }
        else if(response.action === 'research'){
            // research agent call
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
                toolResult: researchResponse
            }
        }
        else if(response.action === 'done'){
            return {
                success: true,
                editedFiles: response.editedFile,
                // errorsFixed: response.errors.
            }
        }
        else{
            return {
                success: false,
                editedFiles: []
            }
        }
    }
}