import type { Screen } from "@google/stitch-sdk"
import { makeOneScreen } from "../services/stitch"
import { BaseAgent } from "./baseAgent"
import { b } from "../../baml_client"
import { makeBoilerPlate } from "../MCPs/figma"
import { UI_VARIANTS_PROMPT } from "../config/sysPrompts"

interface Design {
    designId: string,
    htmlCode: string,
    figmaUrl: string // url for figma
}
export class UIExpert{

    constructor(public userId: string){}

    async craftDesignVariants(userPrompt: string): Promise<string[]> {

        const raw = await this.callLLM(UI_VARIANTS_PROMPT, userPrompt)
        const parsed = JSON.parse(raw)
        return parsed.prompts
    }
    async generateDesigns(userPrompt: string): Promise<Screen[]> {
        const variantPrompts: string[] = await this.craftDesignVariants(userPrompt)
        const designs = await Promise.all(
            variantPrompts.map((p) => makeOneScreen(p, this.userId))
        )
        return designs
    }
    async generateBoilerplate(design: Design): Promise<string> {
        return await makeBoilerPlate(design.figmaUrl)
    }
    
    async callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
        let res : string = ""
        try{
            res = await b.FramePrompts(systemPrompt, userPrompt)
            console.log(res, " is the bunch of prompts")
        }
        catch(e){
            console.error(e)
            throw e
        }
        return res
    }
}