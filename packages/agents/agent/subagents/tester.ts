import Sandbox from "e2b"
import { BaseAgent } from "./baseAgent"
import { b, type ErrorResponse, type TesterContext } from "../../baml_client"
import { prompt } from "../config/promptProfile"
import { MAX_BOOT_WAIT_MS, POLL_INTERVAL_MS, PREVIEW_PORT, PROJECT_ROOT } from "../config/systemConfig"
import type { E2BSandbox } from "../utils/sandbox"
import { logger } from "../utils/logger"
import { observeBaml } from "../utils/tracing"

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

    async testCodebase(context: TesterContext) : Promise<TesterResponse>{
        let stdOutBuf = ""
        let stdErrBuf = ""
        const sandbox = await Sandbox.connect(this.sandbox.sandboxId)
        // --host 0.0.0.0 + --strictPort match GetPreviewUrl's own dev command
        // (sandbox.ts) exactly, and for the same reasons: vite otherwise binds
        // localhost-only, which the sandbox's external proxy can't route to,
        // and the env var is required too — vite always allows a plain
        // "localhost" request but 403s the proxied e2b hostname unless it's
        // explicitly allow-listed. Without it, fetch() gets a real (non-ok)
        // response instead of a connection error, so pollUntilUp still spins
        // until timeout even against a perfectly healthy server.
        const handle = await sandbox.commands.run(`cd ${PROJECT_ROOT} && npm run dev -- --host 0.0.0.0 --strictPort`, {
            background: true,
            envs: { __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: '.e2b.app' },
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
            logger.warn(`Dev server didn't come up in time, reframing error`)
            const error = await this.callLLM(stdErrBuf || stdOutBuf || `Server didn't start within the timeout`, context)
            return {
                success: false,
                errorRes: error
            }
        }
        catch(e){
            logger.error(`testCodebase failed: ${e}`)
            throw e
        }
        finally{
            await handle.kill().catch((e) => logger.warn(`Failed to kill dev server: ${e}`))
        }

    }

    async pollUntilUp(sandbox: Sandbox): Promise<boolean> {
        const deadline = Date.now() + MAX_BOOT_WAIT_MS
        while (Date.now() < deadline) {
            try {
                const response = await fetch(`https://${sandbox.getHost(PREVIEW_PORT)}`)
                if (response.ok) return true
            } catch {
            // connection refused / not up yet — keep polling
            }
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
        }
        return false
    }

    override async callLLM(error: string, context: TesterContext): Promise<ErrorResponse> {
        let errorReFramed: ErrorResponse
        try {
            errorReFramed = await observeBaml(
                "ReframeError",
                { error },
                (opts) => b.ReframeError(prompt("TESTER_ERROR_REFACTOR_PROMPT"), error, context, opts),
            )

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