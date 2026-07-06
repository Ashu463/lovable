import { callMCP } from "./registry";

export async function webScrape(url: string, maxPages: number): Promise<string>{
    return callMCP("apify", "runActor", { actor: "apify/web-scraper",
        input:{
            startUrls: [{url}],
            maxPages: maxPages
        }
    })
}