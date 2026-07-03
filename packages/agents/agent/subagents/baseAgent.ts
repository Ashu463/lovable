import type { DeleteFile, Done, FetchDocs, Message, ReadFile, Research, RunCommand, WriteFile } from "../../baml_client";
import { E2BSandbox } from "../services/sandbox";

type ToolRes = WriteFile | ReadFile | RunCommand | DeleteFile | FetchDocs | Research | Done
interface ToolResult{

}
export abstract class BaseAgent{
    context: Message[] = []
    protected sandbox: E2BSandbox
    constructor(public userId: string, public projectId: string, public sandboxId?: string){
        this.sandbox = new E2BSandbox(this.userId, this.projectId, this.sandboxId)

    }
    
    async runLoop(){
        // query mem0 for context
        while(true){
            const res: ToolRes = await this.callLLM()
            const toolRes = await this.executeFunction(res)
            // sync to memory
            // push to the context smartly
            // guard max iterations
        }
    }

    abstract callLLM(): Promise<ToolRes>
    abstract executeFunction(reseponse: ToolRes): Promise<ToolResult> 
}
