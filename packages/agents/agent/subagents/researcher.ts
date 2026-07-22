import { BaseAgent } from "./baseAgent";
import { webSearch } from "../MCPs/tavily";
import { webScrape } from "../MCPs/apify";
import type { ResearcherContext } from "../../baml_client";
import type { E2BSandbox } from "../utils/sandbox";
import { logger } from "../utils/logger";

/*
what I'm thinking is that this researcher agent would use some RAG/memory things
in future which will probably be done in future. That's why I put different function
and class here else it doesn't make sense at all.
*/
type ResearcherInput = string
type ResearcherResponse = string
type ResearcherResult = string
export class Researcher extends BaseAgent<ResearcherInput, ResearcherContext, ResearcherResponse, ResearcherResult>{
    
    constructor(
        // public query: string,
        // public searchTechnique: "webSearch" | "webScrape",
        userId: string, 
        projectId: string,
        sandbox: E2BSandbox
    ){super(userId, projectId, sandbox)}
    /* Steps: 
    - recieve the query based upon which it will decide web_scrape or web search
    - make the LLM call and return the reponse
    */
    

    async WebSearch(query: string, maxResults: number): Promise<string>{
        let res = ""
        try{
            res = await webSearch(query, maxResults)
            logger.info(`Web search "${query}" returned ${res.length} chars`)
        }
        catch(e){
            logger.error(`Web search "${query}" failed: ${e}`)
            throw e;
        }
        return res
    }
    async WebScrape(url: string[], maxPages: number): Promise<string>{
        let res = ""
        try{
            res = await webScrape(url, maxPages)
            logger.info(`Web scrape of ${url.length} url(s) returned ${res.length} chars`)
        }
        catch(e){
            logger.error(`Web scrape of ${url.length} url(s) failed: ${e}`)
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