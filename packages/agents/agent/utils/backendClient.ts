import axios from "axios";
import { BACKEND_URL } from "../config/systemConfig";

// Defined here rather than imported from events.ts, which would make that module
// and this one circular.
function internalAuthHeader(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}` };
}

// Every call this package makes to the backend is a service-to-service call
// authenticated by INTERNAL_SERVICE_TOKEN, and they all go to the one GraphQL
// endpoint now rather than a REST route per operation.
export async function backendGql<T>(
  query: string,
  variables: Record<string, unknown> = {},
  timeoutMs?: number,
): Promise<T> {
  const res = await axios.post<{ data?: T; errors?: { message: string }[] }>(
    `${BACKEND_URL}/graphql`,
    { query, variables },
    { headers: internalAuthHeader(), ...(timeoutMs ? { timeout: timeoutMs } : {}) },
  );

  // GraphQL answers with HTTP 200 even when the operation failed, so axios won't
  // throw for us here — the errors array is the only signal.
  const first = res.data.errors?.[0];
  if (first) throw new Error(first.message);
  if (!res.data.data) throw new Error("GraphQL response had no data");

  return res.data.data;
}

// Shared because both Agent and SubAgent checkpoint their own state.
export const SAVE_RUN_STATE = `
  mutation SaveRunState($runId: ID!, $contextSnapshot: String, $sessionSnapshot: String, $iteration: Int) {
    saveRunState(
      runId: $runId
      contextSnapshot: $contextSnapshot
      sessionSnapshot: $sessionSnapshot
      iteration: $iteration
    )
  }
`;
