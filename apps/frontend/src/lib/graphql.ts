import { getStoredSession } from "@/lib/session";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
export const GRAPHQL_URL = `${API_BASE}/graphql`;

export class GqlError extends Error {
  constructor(
    message: string,
    // Server-side codes: UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, BAD_USER_INPUT, CONFLICT.
    public code?: string,
  ) {
    super(message);
  }
}

interface GqlOptions {
  auth?: boolean;
}

// Only the server knows whether the stored token still names a real account, so
// every UNAUTHENTICATED reply funnels through here and AuthProvider registers
// the handler that drops the session. Lives outside React because `gql` and the
// SSE client are plain modules, not hooks.
let unauthenticatedHandler: (() => void) | null = null;

export function setUnauthenticatedHandler(handler: (() => void) | null) {
  unauthenticatedHandler = handler;
}

export function reportUnauthenticated() {
  unauthenticatedHandler?.();
}

export async function gql<T>(
  query: string,
  variables?: Record<string, unknown>,
  opts: GqlOptions = {},
): Promise<T> {
  const { auth = true } = opts;
  const headers = new Headers({ "Content-Type": "application/json" });

  if (auth) {
    const session = getStoredSession();
    if (session) headers.set("Authorization", `Bearer ${session.token}`);
  }

  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const payload = await res.json().catch(() => null);

  // GraphQL reports failures in the errors array with a 200, so status alone
  // isn't enough to tell whether the operation succeeded.
  const first = payload?.errors?.[0];
  if (first) {
    const code = first.extensions?.code;
    if (code === "UNAUTHENTICATED") reportUnauthenticated();
    throw new GqlError(first.message ?? "Request failed", code);
  }
  if (!res.ok || !payload?.data) {
    throw new GqlError(`Request failed (${res.status})`);
  }

  return payload.data as T;
}
