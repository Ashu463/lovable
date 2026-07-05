import type { WriteFile, ReadFile, RunCommand, DeleteFile, FetchDocs, Research, Done, Error, DebuggingDone, ToolResult, FileEdit } from "../../baml_client";
import { BaseAgent } from "./baseAgent";
import { b } from "../../baml_client";
import { DEBUGGER_PROMPT } from "../config";

export interface DebuggerAgentResponse{
    success: Boolean,
    editedFiles: FileEdit[],
    // errorsFixed: Error[]
}
type DebuggerRequest = Error[] 
// TODO: implement line by line edit feature, instead writing complete file 
type DebuggerLLMResponse = ReadFile | RunCommand | WriteFile | DebuggingDone | Research

// type DebuggerToolResponse = 
export class DebuggerAgent extends BaseAgent<DebuggerRequest,DebuggerLLMResponse, DebuggerAgentResponse>{

    constructor(
        userId: string,
        projectId: string,
        sandboxId: string

    ){super(userId, projectId, sandboxId)}


    override async callLLM(errors: Error[], toolResult?: ToolResult): Promise<DebuggerLLMResponse> {
        
        try{
            
            const response = await b.DebuggerAgent(DEBUGGER_PROMPT, errors, toolResult)
            
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
        }
        else if(response.action === 'research'){
            // research agent call
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
        return null
    }
}