import { callMCP } from "./registry";

export async function webScrape(url: string): Promise<string>{
    return callMCP("apify", "runActor", { actor: "apify/web-scraper",
        input:{
            startUrls: [{url}],
            maxPages: 100
        }
    })
}