import type { WriteFile, ReadFile, RunCommand, DeleteFile, FetchDocs, Research, Done, Error, DebuggingDone, ToolResult, FileEdit, Message } from "../../baml_client";
import { BaseAgent } from "./baseAgent";
import { b } from "../../baml_client";
import { DEBUGGER_PROMPT } from "../config/sysPrompts";
import { Researcher } from "./researcher";
import { fetchDocs } from "../MCPs/context7";
import { webScrape } from "../MCPs/apify";

export interface DebuggerAgentResponse{
    success: Boolean,
    editedFiles?: FileEdit[] | string,
    toolResult?: string
    // errorsFixed: Error[]
}
type DebuggerRequest = {
  errors: Error[];
  toolResult?: ToolResult;
};
// TODO: implement line by line edit feature, instead writing complete file 
type DebuggerLLMResponse = ReadFile | RunCommand | WriteFile | DebuggingDone | Research

// type DebuggerToolResponse = 
export class DebuggerAgent extends BaseAgent<DebuggerRequest, DebuggerLLMResponse, DebuggerAgentResponse>{

    private researcher: Researcher 
    constructor(
        userId: string,
        projectId: string,
        sandboxId: string

    ){super(userId, projectId, sandboxId)
        this.researcher = new Researcher(this.userId, this.projectId, this.sandboxId)
    }


    override async callLLM(content: DebuggerRequest, context: Message[]): Promise<DebuggerLLMResponse> {
        
        try{
            const response = await b.DebuggerAgent(DEBUGGER_PROMPT, content.errors, context, content?.toolResult)

            return response
        }
        catch(e){
            throw new Error("Debugger call failed")
        }
    }
    override async executeFunction(response: DebuggerLLMResponse): Promise<DebuggerAgentResponse | null> {
        // research agent call

        if(response.action === 'read' || response.action === 'writeFile' || response.action === 'runCommand'){
            const sandboxRes = await this.sandbox.Execute(this.sandboxId, response)
            return {
                success: true,
                editedFiles: sandboxRes
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