import axios from "axios";
import { BACKEND_URL } from "../config/systemConfig";

export async function backendGql<T>(
  query: string,
  variables: Record<string, unknown> = {},
  timeoutMs?: number,
): Promise<T> {
  const res = await axios.post<{ data?: T; errors?: { message: string }[] }>(
    `${BACKEND_URL}/graphql`,
    { query, variables },
    { headers: { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}` }, ...(timeoutMs ? { timeout: timeoutMs } : {}) },
  );

  const first = res.data.errors?.[0];
  if (first) throw new Error(first.message);
  if (!res.data.data) throw new Error("GraphQL response had no data");

  return res.data.data;
}

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
