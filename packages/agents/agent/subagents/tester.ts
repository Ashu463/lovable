import Sandbox from "e2b"
import { BaseAgent } from "./baseAgent"
import { b, type ErrorResponse, type TesterContext } from "../../baml_client"
import { TESTER_PROMPT } from "../config/sysPrompts"
import { MAX_BOOT_WAIT_MS, POLL_INTERVAL_MS, PORT } from "../config/systemConfig"
import type { E2BSandbox } from "../utils/sandbox"

type TesterInput = ""
type TesterLLMResponse = ErrorResponse
export type TesterResponse = {
    success: boolean,
    errorRes?: ErrorResponse
}

export class TesterAgent extends BaseAgent<TesterInput, TesterContext, TesterLLMResponse, TesterResponse>{
    
    constructor(
        userId: string, 
        projectId: string, 
        sandbox: E2BSandbox)
    {
        super(userId, projectId, sandbox)
    }

    async testCodebase() : Promise<TesterResponse>{
        let stdOutBuf = ""
        let stdErrBuf = ""
        const sandbox = await Sandbox.connect(this.sandbox.sandboxId)
        // #TEST: replace with appropriate path of project directory
        const handle = await sandbox.commands.run(`cd /home/usr/${this.userId}/projects/${this.projectId} && npm run dev`, {
            background: true,
            onStdout: (data: string) => {stdOutBuf += data},
            onStderr: (data: string) => {stdErrBuf += data}
        })


        try{
            const response = await fetch(sandbox.getHost(PORT))
            const started = await this.pollUntilUp(sandbox)
            if(started){
                return{
                    success: true
                }
            }
            await handle.kill()
            const error = await this.callLLM(stdErrBuf || stdOutBuf || `Server didn't start within the timeout`)
            return {
                success: false,
                errorRes: error
            }
        }
        catch(e){
            console.error(e)
            throw e
        }
        
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