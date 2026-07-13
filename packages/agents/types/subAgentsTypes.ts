
// export interface DebuggerLLMResponse{
//     stopReason: string,
//     toolCall?: ReadFile | RunCommand | WriteFile | DebuggingDone | Research

import type { CoderContext, DebuggerContext, PlannerTodo, ToolResult, UIExpertContext, Error } from "../baml_client"

// }
export type SubAgentType = 'coder' | 'debuggerr' | 'tester' |  'researcher' |  'uiExpert'
export type SubAgentsTodo = {
    taskId: number,
    task: string,
    dependentTasks: number[],
    agentSpecificData: SubAgentTodoDataMap[SubAgentType]
}
type SubAgentTodoDataMap = {
    coder: { relatedDesignRef?: { screenId: string } }
    uiExpert: { screenId: string; mode: 'create' | 'update' | 'create-consistent'; referenceScreenIds?: string[] }
    debuggerr: {} 
    tester: {} 
    researcher: { query: string; maxResults?: number }
}
export interface BaseTaskInput{
    task: SubAgentsTodo
    agentType: SubAgentType
}
export type CoderTaskInput = BaseTaskInput

export type DebuggerTaskInput = BaseTaskInput & {
    errors: Error[]
    toolResult: ToolResult
}

export type TesterTaskInput = {}

export type ResearchTaskInput = BaseTaskInput 

export type UIExpertTaskInput = BaseTaskInput & {
    query: string, // this all need to refactored, dw
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

export type SubAgentResponse = {
    success: boolean,
    summary: string
}