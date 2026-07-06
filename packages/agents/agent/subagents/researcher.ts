import type { CoderContext } from "../../baml_client";
import { RESEARCHER_PROMPT } from "../config";
import { skills } from "../skills";
import {b} from '../../baml_client'
import { BaseAgent } from "./baseAgent";
import { webSearch } from "../MCPs/tavily";
import { webScrape } from "../MCPs/apify";

/*
what I'm thinking is that this researcher agent would use some RAG/memory things
in future which will probably be done in future. That's why I put different function
and class here else it doesn't make sense at all. 
*/
type ReasercherInput = string
type ResearcherResponse = string
type ResearcherResult = string
export class Researcher extends BaseAgent<ReasercherInput, ResearcherResponse, ResearcherResult>{
    
    constructor(
        // public query: string,
        // public searchTechnique: "webSearch" | "webScrape",
        userId: string, 
        projectId: string,
        sandboxId: string
    ){super(userId, projectId, sandboxId)}
    /* Steps: 
    - recieve the query based upon which it will decide web_scrape or web search
    - make the LLM call and return the reponse
    */
    

    async WebSearch(query: string, maxResults: number): Promise<string>{
        let res = ""
        try{
            res = await webSearch(query, maxResults)
            console.log(res, " is the web search response")
        }
        catch(e){
            console.error(e)
            throw e;
        }
        return res
    }
    async WebScrape(url: string, maxPages: number): Promise<string>{
        let res = ""
        try{
            res = await webScrape(url, maxPages)
            console.log(res, " is the web scrape response")
        }
        catch(e){
            console.error(e)
            throw e;
        }
        return res
    }

    override async callLLM(content: string): Promise<string> {
        return "LLM call of researcher which shouldn't supposed to be built"
    }
    override async executeFunction(content: string): Promise<string | null> {
        return "tool call of researcher which is also shouldn't be supposed. "
    }
}