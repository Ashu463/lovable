import { callMCP } from "./registry";

export async function webScrape(urls: string[], maxPages: number): Promise<string>{
    return callMCP("apify", "runActor", { actor: "apify/web-scraper",
        input:{
            startUrls: [urls],
            maxPages: maxPages
        }
    })
}