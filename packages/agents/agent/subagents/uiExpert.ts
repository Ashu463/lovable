import type { Screen } from "@google/stitch-sdk"
import { makeOneScreen } from "../tools/stitch"
import { BaseAgent } from "./baseAgent"
import { b, type CoderContext, type DesignVariants, type Skill, type WriteFile, type ReadFile, type EditFile, type RunCommand, type DeleteFile, type Done, type Abort } from "../../baml_client"
import { UI_VARIANTS_PROMPT, UI_EXPERT_BASE_TEMPLATE_PROMPT } from "../config/systemPrompts"
import type { E2BSandbox } from "../utils/sandbox"
import type { UIExpertTaskInput } from "../../types/subAgentsTypes"
import { designFilePath } from "../utils/designPath"
import { logger } from "../utils/logger"
import { observeBaml } from "../utils/tracing"

type UIExpertRequest = {userPrompt: string, semanticMem: string}

// Phase B: base-template tool loop, mechanically identical to CoderAgent's
// (minus research/docs — see UI_EXPERT_BASE_TEMPLATE_PROMPT for why).
type UIExpertLLMResponse = WriteFile | ReadFile | EditFile | RunCommand | DeleteFile | Done | Abort
type UIExpertAgentResponse = {
    success: boolean,
    response: string,
}

export class UIExpert extends BaseAgent<UIExpertTaskInput, CoderContext, UIExpertLLMResponse, UIExpertAgentResponse>{

    private htmlDesign: string | null = null

    constructor(
        userId: string,
        projectId: string,
        sandbox: E2BSandbox,
        private baseDir: string,
    ){super(userId, projectId, sandbox)}

    private async framePrompts(userPrompt: string, semanticMem: string, skills: Skill[]): Promise<DesignVariants> {
        try{
            const res = await observeBaml(
                "FramePrompts",
                { userPrompt },
                (opts) => b.FramePrompts(UI_VARIANTS_PROMPT, userPrompt, semanticMem, skills, opts),
            )
            logger.info(`Framed ${res.prompts.length} design variant prompt(s)`)
            return res
        }
        catch(e){
            logger.error(`Failed to frame design variant prompts: ${e}`)
            throw e
        }
    }

    async craftDesignVariants(request: UIExpertRequest, skills: Skill[]): Promise<string[]> {
        const res = await this.framePrompts(request.userPrompt, request.semanticMem, skills)
        return res.prompts
    }
    async generateDesigns(userPrompt: string, semanticMem: string, skills: Skill[]): Promise<{ screen: Screen, prompt: string }[]> {
        const variantPrompts: string[] = await this.craftDesignVariants({userPrompt, semanticMem}, skills)
        const settled = await Promise.allSettled(
            variantPrompts.map((p) => makeOneScreen(p, this.userId).then((screen) => ({ screen, prompt: p })))
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

    async fetchDesigns(designs: { screen: Screen, prompt: string }[]): Promise<{ html: string, prompt: string }[]>{
        const settled = await Promise.allSettled(
            designs.map(async (d) => ({ html: await this.fetchDesignHtml(d.screen), prompt: d.prompt }))
        )

        const html = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
        for (const r of settled) {
            if (r.status === "rejected") logger.warn(`Design HTML fetch failed, continuing with the rest: ${r.reason}`)
        }
        if (html.length === 0) {
            throw new Error(`Could not fetch HTML for any of the ${designs.length} generated design(s)`)
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


    private async setBaseTemplate(input: UIExpertTaskInput): Promise<string> {
        const preferences = input.uiPreferences
            .map((p) => `- ${p.question}\n  ${p.answer}`)
            .join('\n')
        const prompt = preferences
            ? `${input.task.task}\n\nUI preferences for this project:\n${preferences}`
            : input.task.task
        const screen = await makeOneScreen(prompt, this.userId)
        const html = await this.fetchDesignHtml(screen)

        const path = designFilePath(input.task.taskId, input.task.task)
        const writeRes = await this.sandbox.Execute(this.sandbox.sandboxId, { action: 'writeFile', path, content: html }, this.baseDir)
        if (!writeRes.success) {
            logger.warn(`Failed to save design to sandbox at ${path}: ${writeRes.content}`)
        }

        return html
    }

    override async callLLM(input: UIExpertTaskInput, context: CoderContext): Promise<UIExpertLLMResponse> {
        if (this.htmlDesign === null) {
            this.htmlDesign = await this.setBaseTemplate(input)
        }
        const html = this.htmlDesign
        return await observeBaml(
            "UIExpertAgent",
            { task: context.task },
            (opts) => b.UIExpertAgent(UI_EXPERT_BASE_TEMPLATE_PROMPT, html, context, opts),
        )
    }

    override async executeFunction(response: UIExpertLLMResponse): Promise<UIExpertAgentResponse> {
        if (
            response.action === 'read'
            || response.action === 'writeFile'
            || response.action === 'delete'
            || response.action === 'runCommand'
            || response.action === 'editFile'
        ) {
            const sandboxRes = await this.sandbox.Execute(this.sandbox.sandboxId, response, this.baseDir)
            return {
                success: sandboxRes.success,
                response: sandboxRes.content
            }
        }
        else if (response.action === 'done') {
            return {
                success: true,
                response: `UIExpert base template completed`
            }
        }
        else if (response.action === 'abort') {
            return {
                success: false,
                response: response.reason
            }
        }
        return {
            success: false,
            response: "Unknown Error occurred"
        }
    }
}
