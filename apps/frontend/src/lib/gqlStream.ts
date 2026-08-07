import { createClient } from "graphql-sse";
import { getStoredSession } from "@/lib/session";
import { GRAPHQL_URL, reportUnauthenticated } from "@/lib/graphql";

interface StreamHandlers<T> {
  onEvent: (data: T) => void;
  onError?: (err: unknown) => void;
  onComplete?: () => void;
}

// graphql-sse sends the query over a POST body rather than a URL, so unlike
// native EventSource it can carry an Authorization header — which is why this
// stream uses SSE rather than WebSockets.
const client = createClient({
  url: `${GRAPHQL_URL}/stream`,
  headers: (): Record<string, string> => {
    const session = getStoredSession();
    return session ? { Authorization: `Bearer ${session.token}` } : {};
  },
});

// Returns an unsubscribe function, matching the shape the old SSE helper had.
export function subscribe<T>(
  query: string,
  variables: Record<string, unknown>,
  handlers: StreamHandlers<T>,
): () => void {
  return client.subscribe<T>(
    { query, variables },
    {
      next: (result) => {
        if (result.errors?.length) {
          if (result.errors[0]!.extensions?.code === "UNAUTHENTICATED") reportUnauthenticated();
          handlers.onError?.(new Error(result.errors[0]!.message));
          return;
        }
        if (result.data) handlers.onEvent(result.data);
      },
      // A subscription rejected before it streams surfaces here as the raw
      // GraphQL error array rather than through `next`.
      error: (err) => {
        const errors = (Array.isArray(err) ? err : []) as { extensions?: { code?: string } }[];
        if (errors.some((e) => e?.extensions?.code === "UNAUTHENTICATED")) reportUnauthenticated();
        handlers.onError?.(err);
      },
      complete: () => handlers.onComplete?.(),
    },
  );
}
