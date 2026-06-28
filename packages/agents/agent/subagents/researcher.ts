import type { CoderContext, ResearcherResponse } from "../../baml_client";
import { RESEARCHER_PROMPT } from "../config";
import { skills } from "../skills";
import {b} from '../../baml_client'

export class Researcher {
    
    constructor(
        // public query: string,
        // public searchTechnique: "webSearch" | "webScrape",
    ){}
    /* Steps: 
    - recieve the query based upon which it will decide web_scrape or web search
    - make the LLM call and return the reponse
    */
    
    skills = [skills.webSearch, skills.read_blogs, skills.read_docs]

    async Search(query: string, searchType: string): Promise<CoderContext>{

    }
    async LLMCall(query: string, searchTechnique: string): Promise<ResearcherResponse>{

        const response = await b.ResearchAgent(query, RESEARCHER_PROMPT, searchTechnique)
        return response
    }

}