import Sandbox from "e2b"
import { BaseAgent } from "./baseAgent"
import { b, type ErrorResponse, type TesterContext } from "../../baml_client"
import { TESTER_ERROR_REFACTOR_PROMPT } from "../config/sysPrompts"
import { MAX_BOOT_WAIT_MS, POLL_INTERVAL_MS, PORT, PROJECT_ROOT } from "../config/systemConfig"
import type { E2BSandbox } from "../utils/sandbox"
import { logger } from "../utils/logger"

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
        const handle = await sandbox.commands.run(`cd ${PROJECT_ROOT} && npm run dev`, {
            background: true,
            onStdout: (data: string) => {stdOutBuf += data},
            onStderr: (data: string) => {stdErrBuf += data}
        })


        try{
            const started = await this.pollUntilUp(sandbox)
            if(started){
                logger.info(`Dev server started`)
                return{
                    success: true
                }
            }
            logger.warn(`Dev server didn't come up in time, killing and reframing error`)
            await handle.kill()
            const error = await this.callLLM(stdErrBuf || stdOutBuf || `Server didn't start within the timeout`)
            return {
                success: false,
                errorRes: error
            }
        }
        catch(e){
            logger.error(`testCodebase failed: ${e}`)
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
            errorReFramed = await b.ReframeError(TESTER_ERROR_REFACTOR_PROMPT, error)

        } catch (error) {
            logger.error(`ReframeError failed: ${error}`)
            throw error
        }
        return errorReFramed
    }
    override async executeFunction(content: ErrorResponse): Promise<any> {
        // that vercel MCP would be here. 
        return await ""
    }
}