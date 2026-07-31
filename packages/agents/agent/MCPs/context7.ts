import { callMCP } from './registry'

// resolve-library-id answers with a human-readable ranked list, not a bare id:
//
//   Available Libraries:
//
//   - Title: React Router
//   - Context7-compatible library ID: /remix-run/react-router
//   - Description: ...
//   ----------
//
// The previous version passed that whole blob straight into the next call as
// `libraryId`, so even once the package name and tool name were right it would
// still have returned nothing. Results are ranked, so the first id is the match.
function firstLibraryId(resolveOutput: string): string | null {
  return resolveOutput.match(/Context7-compatible library ID:\s*(\S+)/)?.[1] ?? null
}

export async function fetchDocs(library: string, query: string): Promise<string> {
  // Both args are required by resolve-library-id as of context7-mcp v3 — the
  // query is what ranks the candidates, not just the library name.
  const resolved = await callMCP("context7", "resolve-library-id", {
    libraryName: library,
    query
  })

  const libraryId = firstLibraryId(resolved)
  if (!libraryId) {
    return `No Context7 library matched "${library}". Try a different library name, or use web search instead.`
  }

  // v3 renamed get-library-docs to query-docs and dropped the `tokens` param.
  return callMCP("context7", "query-docs", { libraryId, query })
}
