export const PORT = 3000
export const SANDBOX_HOME = '/home/user'
export const PROJECT_ROOT = `${SANDBOX_HOME}/app`
export const MAX_BOOT_WAIT_MS = 60000
export const POLL_INTERVAL_MS = 500
// react-template's `dev` script is a bare `vite`, whose own default port is
// 5173 — this just names that default, it doesn't force a different one.
export const PREVIEW_PORT = 5173
export const BACKEND_URL = process.env.BACKEND_URL ?? `http://localhost:3000`
export const REDIS_HOST = process.env.REDIS_HOST ?? "redis"
export const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6380)
export const AGENT_MAX_ITERATIONS = 25
// Must stay under the *model's* window, not a hypothetical one — at 200k with
// gpt-4o-mini (128k) the threshold sat above the hard limit, so compaction never
// fired and the API rejected the call instead. Raise this when the model changes.
export const MAX_CONTEXT_WINDOW_LENGTH = 1_28_000
export const COMPACTION_PARAMETER = 10
export const COMPACT_THRESHOLD = 0.8*MAX_CONTEXT_WINDOW_LENGTH
export const CODER_MAX_ITERATIONS = 18
export const DEBUGGERR_MAX_ITERATIONS = 10
// Researcher/tester/uiExpert are single-shot (see SubAgent.isSingleShotAgent), so
// their loop breaks on the first pass and these caps never actually bind.
export const RESEARCHER_MAX_ITERATIONS = 1
export const TESTER_MAX_ITERATIONS = 1
export const UI_EXPERT_MAX_ITERATIONS = 1
// Each pass costs a full tester boot-wait plus a whole debugger run, and the
// error-signature halt already catches a stuck debugger after 2 repeats.
export const TESTER_DEBUGGER_LOOP_MAX_ITERATIONS = 3
// Hard ceiling on LLM calls per run — the per-agent caps above bound one agent,
// not the whole run, so a complex DAG can still multiply them out. This is the
// money guard; raise it once runs are trustworthy.
export const RUN_MAX_LLM_CALLS = 120
export const RECENT_TURNS_LIMIT = 20
export const TOOL_RESULT_MAX_CHARS = 2000
// only for READ tool
export const READ_RESULT_MAX_CHARS = 12000
export const REPO_TREE_PRUNE_DIRS = [
    'node_modules', '.git', 'dist', 'build', '.next', '.turbo',
    'coverage', '.cache', '.vite', '.output', 'vendor'
]
export const REPO_TREE_MAX_ENTRIES = 400
export const RUN_COMMAND_TIMEOUT_MS = 300_000
export const SANDBOX_TIMEOUT_MS = 60 * 60 * 1000
export const SANDBOX_KEEPALIVE_INTERVAL_MS = 10 * 60 * 1000
export const TASK_SANDBOX_RETRY_LIMIT = 5
export const SUBAGENT_LLM_RETRY_ATTEMPTS = 3
export const SUBAGENT_TOOL_RETRY_ATTEMPTS = 2
export const SUBAGENT_RETRY_BACKOFF_MS = 1000
export const AGENT_LLM_RETRY_ATTEMPTS = 3
// A 429 needs to wait out a window, not the ~1s a transient failure needs.
export const RATE_LIMIT_BACKOFF_MS = 20_000
export const RETRY_MAX_BACKOFF_MS = 60_000