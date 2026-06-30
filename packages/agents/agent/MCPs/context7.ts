import { callMCP } from './registry'

export async function fetchDocs(library: string, query: string): Promise<string> {
  const libraryId = await callMCP("context7", "resolve-library-id", { libraryName: library })
  return callMCP("context7", "get-library-docs", { libraryId: libraryId.trim(), query, tokens: 5000 })
}
