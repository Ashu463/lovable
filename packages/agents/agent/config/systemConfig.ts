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
export const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6379)
export const MAIN_AGENT_MAX_ITERATIONS = 40
export const MAX_CONTEXT_WINDOW_LENGTH = 2_00_000
export const COMPACTION_PARAMETER = 10
export const COMPACT_THRESHOLD = 0.8*MAX_CONTEXT_WINDOW_LENGTH
export const CODER_MAX_ITERATIONS = 25
export const DEBUGGERR_MAX_ITERATIONS = 15
export const RESEARCHER_MAX_ITERATIONS = 8
export const TESTER_MAX_ITERATIONS = 15
export const UI_EXPERT_MAX_ITERATIONS = 10
export const TESTER_DEBUGGER_LOOP_MAX_ITERATIONS = 5
export const RECENT_TURNS_LIMIT = 20
export const TOOL_RESULT_MAX_CHARS = 2000
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
export const MAIN_AGENT_LLM_RETRY_ATTEMPTS = 3