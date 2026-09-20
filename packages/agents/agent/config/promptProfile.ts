import {
    UI_EXPERT_BASE_TEMPLATE_PROMPT,
    CODER_PROMPT,
    DEBUGGER_PROMPT,
    AGENT_SYSTEM_PROMPT,
    TESTER_ERROR_REFACTOR_PROMPT,
} from "./systemPrompts"
import {
    UI_EXPERT_BASE_TEMPLATE_PROMPT_GPT,
    CODER_PROMPT_GPT,
    DEBUGGER_PROMPT_GPT,
    AGENT_SYSTEM_PROMPT_GPT,
    TESTER_ERROR_REFACTOR_PROMPT_GPT,
} from "./systemPrompts.gpt"

// Prompt-profile switch. Set PROMPT_PROFILE=gpt in the env to load the
// gpt-4o-mini-tuned prompts (systemPrompts.gpt.ts); anything else — 'general'
// or unset — loads the originals in systemPrompts.ts that suit deepseek and
// other models. Default is 'general', so existing behavior is unchanged until
// you explicitly opt in.
export type PromptProfile = "gpt" | "general"

export const PROMPT_PROFILE: PromptProfile =
    process.env.PROMPT_PROFILE === "gpt" ? "gpt" : "general"

// Map of prompt key -> per-profile variant. A key only needs a `gpt` entry once
// a gpt-tuned variant exists; until then the resolver falls back to `general`,
// so adding variants later is incremental and never breaks a consumer. As you
// write gpt versions of the coder/debugger/agent prompts, add them here.
const PROMPTS = {
    UI_EXPERT_BASE_TEMPLATE_PROMPT: {
        general: UI_EXPERT_BASE_TEMPLATE_PROMPT,
        gpt: UI_EXPERT_BASE_TEMPLATE_PROMPT_GPT,
    },
    CODER_PROMPT: {
        general: CODER_PROMPT,
        gpt: CODER_PROMPT_GPT,
    },
    DEBUGGER_PROMPT: {
        general: DEBUGGER_PROMPT,
        gpt: DEBUGGER_PROMPT_GPT,
    },
    AGENT_SYSTEM_PROMPT: {
        general: AGENT_SYSTEM_PROMPT,
        gpt: AGENT_SYSTEM_PROMPT_GPT,
    },
    TESTER_ERROR_REFACTOR_PROMPT: {
        general: TESTER_ERROR_REFACTOR_PROMPT,
        gpt: TESTER_ERROR_REFACTOR_PROMPT_GPT,
    },
} satisfies Record<string, { general: string; gpt?: string }>

// Resolve a prompt for the active profile, falling back to general when the
// active profile has no variant for this key.
export function prompt(key: keyof typeof PROMPTS): string {
    const entry = PROMPTS[key]
    return PROMPT_PROFILE === "gpt" && entry.gpt ? entry.gpt : entry.general
}
