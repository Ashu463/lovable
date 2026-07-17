import type { Screen } from "@google/stitch-sdk"
import { makeOneScreen } from "../tools/stitch"
import { BaseAgent } from "./baseAgent"
import { b, type UIExpertContext } from "../../baml_client"
import { makeBoilerPlate } from "../MCPs/figma"
import { UI_VARIANTS_PROMPT } from "../config/sysPrompts"
import type { E2BSandbox } from "../utils/sandbox"

interface Design {
    designId: string,
    htmlCode: string,
    figmaUrl: string // url for figma
}
type UIExpertRequest = {userPrompt: string, semanticMem: string}
type UIExpertLLMResponse = {}
type UIExpertAgentResponse = {}

export class UIExpert extends BaseAgent<UIExpertRequest, UIExpertContext, UIExpertLLMResponse, UIExpertAgentResponse>{

    constructor(
        userId: string,
        projectId: string,
        sandbox: E2BSandbox,
    ){super(userId, projectId, sandbox)}


    async craftDesignVariants(request: UIExpertRequest): Promise<string[]> {

        const raw = await this.callLLM(request)
        const parsed = JSON.parse(raw)
        return parsed.prompts
    }
    async generateDesigns(userPrompt: string, semanticMem: string): Promise<Screen[]> {
        const variantPrompts: string[] = await this.craftDesignVariants({userPrompt, semanticMem})
        const designs = await Promise.all(
            variantPrompts.map((p) => makeOneScreen(p, this.userId))
        )
        return designs
    }
    async generateBoilerplate(design: Design): Promise<string> {
        return await makeBoilerPlate(design.figmaUrl)
    }
    
    override async callLLM(request: UIExpertRequest): Promise<string> {
        let res : string = ""
        try{
            res = await b.FramePrompts(UI_VARIANTS_PROMPT, request.userPrompt, request.semanticMem)
            console.log(res, " is the bunch of prompts")
        }
        catch(e){
            console.error(e)
            throw e
        }
        return res
    }

    override async executeFunction(content: UIExpertLLMResponse): Promise<UIExpertAgentResponse | null> {
        return null;
    }
}