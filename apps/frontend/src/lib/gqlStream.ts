import { createClient } from "graphql-sse";
import { getStoredSession } from "@/lib/session";
import { GRAPHQL_URL } from "@/lib/graphql";

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
          handlers.onError?.(new Error(result.errors[0]!.message));
          return;
        }
        if (result.data) handlers.onEvent(result.data);
      },
      error: (err) => handlers.onError?.(err),
      complete: () => handlers.onComplete?.(),
    },
  );
}
