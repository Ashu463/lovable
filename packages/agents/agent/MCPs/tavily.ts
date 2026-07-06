import { callMCP } from './registry'

export async function webSearch(query: string, maxResults: number): Promise<string> {
  return callMCP("tavily", "tavily-search", { query, max_results: maxResults })
}
