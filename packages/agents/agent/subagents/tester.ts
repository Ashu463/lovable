import Sandbox from "e2b"
import { BaseAgent } from "./baseAgent"
import { b, type ErrorResponse } from "../../baml_client"
import { TESTER_PROMPT } from "../config/sysPrompts"
import { MAX_BOOT_WAIT_MS, POLL_INTERVAL_MS, PORT } from "../config/systemConfig"

type TesterInput = ""
type TesterLLMResponse = ErrorResponse
type TesterResponse = ""
export class TesterAgent extends BaseAgent<TesterInput, TesterLLMResponse, TesterResponse>{
    
    constructor(
        userId: string, 
        projectId: string, 
        sandboxId: string)
    {
        super(userId, projectId, sandboxId)
    }

    async testCodebase() : Promise<ErrorResponse>{
        let error!: ErrorResponse
        let stdOutBuf = ""
        let stdErrBuf = ""
        const sandbox = await Sandbox.connect(this.sandboxId)
        
        const handle = await sandbox.commands.run(`cd /home/usr/${this.userId}/projects/${this.projectId} && npm run dev`, {
            background: true,
            onStdout: (data: string) => {stdOutBuf += data},
            onStderr: (data: string) => {stdErrBuf += data}
        })


        try{
            const response = await fetch(sandbox.getHost(PORT))
            const started = await this.pollUntilUp(sandbox)
            if(started){
                // trigger the deploy pipeline 
            }
            await handle.kill()
            return await this.callLLM(stdErrBuf || stdOutBuf || `Server didn't start within the timeout`)
        }
        catch(e){
            console.error(e)
            throw e
        }
        return error
    }

    async pollUntilUp(sandbox: Sandbox): Promise<boolean> {
        const deadline = Date.now() + MAX_BOOT_WAIT_MS
        while (Date.now() < deadline) {
            try {
            const response = await fetch(sandbox.getHost(PORT))
            if (response.ok) return true
            } catch {
            // connection refused / not up yet — keep polling
            }
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
        }
        return false
    }

    override async callLLM(error: string): Promise<ErrorResponse> {
        let errorReFramed: ErrorResponse
        try {
            errorReFramed = await b.ReframeError(TESTER_PROMPT, error)

        } catch (error) {
            console.error(error)
            throw error
        }
        return errorReFramed
    }
    override async executeFunction(content: ErrorResponse): Promise<any> {
        // that vercel MCP would be here. 
        return await ""
    }
}