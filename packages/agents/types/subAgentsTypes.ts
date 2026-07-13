
// export interface DebuggerLLMResponse{
//     stopReason: string,
//     toolCall?: ReadFile | RunCommand | WriteFile | DebuggingDone | Research

import type { CoderContext, DebuggerContext, PlannerTodo, ToolResult, UIExpertContext, Error } from "../baml_client"

// }
export type SubAgentType = 'coder' | 'debuggerr' | 'tester' |  'researcher' |  'uiExpert'
export interface BaseTaskInput{
    task: PlannerTodo
    agentType: SubAgentType
}
export type CoderTaskInput = BaseTaskInput

export type DebuggerTaskInput = BaseTaskInput & {
    errors: Error[]
    toolResult: ToolResult
}

export type TesterTaskInput = BaseTaskInput & {
    error: Error
}

export type ResearchTaskInput = BaseTaskInput 

export type UIExpertTaskInput = BaseTaskInput & {
    query: string,
}
export type InputMap = {
    coder: CoderTaskInput;
    debuggerr: DebuggerTaskInput,
    tester: TesterTaskInput,
    researcher: ResearchTaskInput,
    uiExpert: UIExpertTaskInput
}
// export type InputMap = CoderTaskInput | DebuggerTaskInput | TesterTaskInput | ResearchTaskInput | UIExpertTaskInput

export type ContextMap = {
    coder: CoderContext,
    debuggerr: DebuggerContext,
    tester: TesterContext,
    researcher: ResearcherContext,
    uiExpert: UIExpertContext
}
export type ResearcherContext = {
    query: string
}

export type TesterContext = Record<string, never>

// session types for subagents
export type SessionMap = {
    coder: CoderSession,
    debuggerr: DebuggerSession,
    tester: TesterSession,
    researcher: ResearcherSession,
    uiExpert: UIExpertSession
}
export type Role = "user" | "assistant" | "tool"
export type Status = 'in_progress' | 'halted' | 'resolved' | 'done';
type BaseSession = {
    taskId: number;
    role: Role
    status: Status
    iterationCount: number;
    timestamp: string;
    content?: any
};
export type DebuggerSession = BaseSession & {
    rawTranscript?: string;         // full LLM back-and-forth, for debugging/audit — you said this matters for Debugger specifically
};
export type CoderSession = BaseSession
export type TesterSession = BaseSession
export type ResearcherSession = BaseSession
export type UIExpertSession = BaseSession