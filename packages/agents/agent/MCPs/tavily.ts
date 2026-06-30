import { callMCP } from './registry'

export async function webSearch(query: string, maxResults = 5): Promise<string> {
  return callMCP("tavily", "tavily-search", { query, max_results: maxResults })
}
