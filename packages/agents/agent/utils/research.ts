import type { Research } from "../../baml_client";
import { fetchDocs } from "../MCPs/context7";
import type { Researcher } from "../subagents/researcher";

/*
Every agent that can emit a `research` action dispatches the same three search
types onto the same backends, so the dispatch lives here instead of in each
subagent's executeFunction.
*/
export async function runResearch(researcher: Researcher, searchType: Research["searchType"]): Promise<string> {
    if (searchType.type === 'webSearch') {
        return await researcher.WebSearch(searchType.query, searchType.maxResults)
    }
    if (searchType.type === 'webScrape') {
        return await researcher.WebScrape(searchType.urls, searchType.maxPages)
    }
    if (searchType.type === 'docsSearch') {
        return await fetchDocs(searchType.library, searchType.query)
    }
    throw new Error("Invalid research type")
}
