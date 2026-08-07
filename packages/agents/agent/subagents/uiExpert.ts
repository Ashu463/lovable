import type { Screen } from "@google/stitch-sdk"
import { makeOneScreen } from "../tools/stitch"
import { BaseAgent } from "./baseAgent"
import { b, type UIExpertContext, type DesignVariants, type Skill } from "../../baml_client"
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


    async craftDesignVariants(request: UIExpertRequest, skills: Skill[]): Promise<string[]> {
        const context: UIExpertContext = { userPrompt: request.userPrompt, priorDesigns: [], skills }
        const res = await this.callLLM(request, context)
        return res.prompts
    }
    async generateDesigns(userPrompt: string, semanticMem: string, skills: Skill[]): Promise<Screen[]> {
        const variantPrompts: string[] = await this.craftDesignVariants({userPrompt, semanticMem}, skills)
        const settled = await Promise.allSettled(
            variantPrompts.map((p) => makeOneScreen(p, this.userId))
        )

        const designs = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
        for (const r of settled) {
            if (r.status === "rejected") logger.warn(`Design variant failed, continuing with the rest: ${r.reason}`)
        }
        if (designs.length === 0) {
            throw new Error(`All ${variantPrompts.length} design variants failed: ${settled.map((r) => r.status === "rejected" ? r.reason : "").join(" | ")}`)
        }
        logger.info(`Generated ${designs.length}/${variantPrompts.length} design variant(s)`)

        return designs
    }
    async fetchDesigns(screens: Screen[]): Promise<string[]>{
        const settled = await Promise.allSettled(
            screens.map(screen => this.fetchDesignHtml(screen))
        )

        const html = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
        for (const r of settled) {
            if (r.status === "rejected") logger.warn(`Design HTML fetch failed, continuing with the rest: ${r.reason}`)
        }
        if (html.length === 0) {
            throw new Error(`Could not fetch HTML for any of the ${screens.length} generated design(s)`)
        }

        return html
    }
    async fetchDesignHtml(screen: Screen): Promise<string> {
        let htmlUrl = await screen.getHtml();
        for (let attempt = 1; attempt <= 5 && !htmlUrl; attempt++) {
            logger.warn(`Screen ${screen.screenId} HTML not ready, retrying (${attempt}/5)`);
            await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
            htmlUrl = await screen.getHtml();
        }

        if (!htmlUrl) {
            throw new Error(`Stitch never returned an HTML URL for screen ${screen.screenId}`);
        }

        const res = await fetch(htmlUrl);

        if (!res.ok) {
            throw new Error(`Failed to fetch HTML for screen ${screen.screenId}: ${res.status} ${res.statusText}`);
        }

        return await res.text();
    }
    
    override async callLLM(request: UIExpertRequest, context: UIExpertContext): Promise<DesignVariants> {
        try{
            const res = await b.FramePrompts(UI_VARIANTS_PROMPT, request.userPrompt, request.semanticMem, context.skills)
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