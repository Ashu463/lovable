
// export interface DebuggerLLMResponse{
//     stopReason: string,
//     toolCall?: ReadFile | RunCommand | WriteFile | DebuggingDone | Research

import type { CoderContext, DebuggerContext, PlannerTodo, ToolResult, Error, ResearcherContext, TesterContext } from "../baml_client"
import type { UIPreferenceQA } from "./callAgentTypes"

// }
export type SubAgentType = 'coder' | 'debuggerr' | 'tester' |  'researcher' |  'uiExpert'
export type SubAgentsTodo = {
    taskId: number,
    task: string,
    // Fuller intent from the planner (the "why" behind `task`) and a soft
    // tool-call budget hint. Surfaced here for subagent prompts to consume.
    description: string,
    expectedToolCalls: number,
    dependentTasks: number[],
    agentSpecificData: SubAgentTodoDataMap[SubAgentType]
}
type SubAgentTodoDataMap = {
    // Coder discovers prior screens/design by reading the sandbox (repoTree +
    // ReadFile) — it never needed a side-channel reference, and the state
    // that used to feed one (CallAgentState.screenId) was never assigned
    // anyway.
    coder: {}
    uiExpert: {}
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
    updatedPrompt: string
    uiPreferences: UIPreferenceQA[]
    // The PlannedScreen id this item translates; its design was pre-generated
    // by the Planner. Absent/degraded -> uiExpert falls back to inline gen.
    designRef?: string
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
    uiExpert: CoderContext
}
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