import type { Screen } from "@google/stitch-sdk"
import { makeOneScreen } from "../tools/stitch"
import { BaseAgent } from "./baseAgent"
import { b, type UIExpertContext, type DesignVariants } from "../../baml_client"
import { UI_VARIANTS_PROMPT } from "../config/sysPrompts"
import type { E2BSandbox } from "../utils/sandbox"
import { logger } from "../utils/logger"

type UIExpertRequest = {userPrompt: string, semanticMem: string}
type UIExpertLLMResponse = DesignVariants
type UIExpertAgentResponse = {}

export class UIExpert extends BaseAgent<UIExpertRequest, UIExpertContext, UIExpertLLMResponse, UIExpertAgentResponse>{

    constructor(
        userId: string,
        projectId: string,
        sandbox: E2BSandbox,
    ){super(userId, projectId, sandbox)}


    async craftDesignVariants(request: UIExpertRequest): Promise<string[]> {
        const res = await this.callLLM(request)
        return res.prompts
    }
    async generateDesigns(userPrompt: string, semanticMem: string): Promise<Screen[]> {
        const variantPrompts: string[] = await this.craftDesignVariants({userPrompt, semanticMem})
        const designs = await Promise.all(
            variantPrompts.map((p) => makeOneScreen(p, this.userId))
        )
        return designs
    }
    async fetchDesigns(screens: Screen[]): Promise<string[]>{
        return Promise.all(
            screens.map(screen => this.fetchDesignHtml(screen))
        )
    }
    async fetchDesignHtml(screen: Screen): Promise<string> {
        const htmlUrl = await screen.getHtml();
        const res = await fetch(htmlUrl);

        if (!res.ok) {
            throw new Error(`Failed to fetch HTML for screen ${screen.screenId}: ${res.status} ${res.statusText}`);
        }

        return await res.text();
    }
    
    override async callLLM(request: UIExpertRequest): Promise<DesignVariants> {
        try{
            const res = await b.FramePrompts(UI_VARIANTS_PROMPT, request.userPrompt, request.semanticMem)
            logger.info(`Framed ${res.prompts.length} design variant prompt(s)`)
            return res
        }
        catch(e){
            logger.error(`Failed to frame design variant prompts: ${e}`)
            throw e
        }
    }

    override async executeFunction(content: UIExpertLLMResponse): Promise<UIExpertAgentResponse | null> {
        return null;
    }
}