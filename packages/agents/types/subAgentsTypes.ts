
// export interface DebuggerLLMResponse{
//     stopReason: string,
//     toolCall?: ReadFile | RunCommand | WriteFile | DebuggingDone | Research

import type { CoderContext, DebuggerContext, Todo, ToolResult, UIExpertContext } from "../baml_client"

// }


interface CoderTaskInput {
  agentType: 'coder'
  boilerplate?: string
  task: Todo
}

interface DebuggerTaskInput {
  agentType: 'debugger'
  errors: Error[]
  toolResult: ToolResult
  task: Todo
}

interface TesterTaskInput {
  agentType: 'tester'
  error: Error
  task: Todo
}

interface ResearchTaskInput {
  agentType: 'researcher'
  query: string
  maxResults: number
  task: Todo
}

interface UIExpertTaskInput{
    agentType: 'uiExpert',
    query: string,
    task: Todo
}
export type SubAgentTaskInput = {
    coder: CoderTaskInput;
    debuggerr: DebuggerTaskInput,
    tester: TesterTaskInput,
    researcher: ResearchTaskInput,
    uiExpert: UIExpertTaskInput

}
export type SubAgentsContext = {
    coder: CoderContext,
    debugger: DebuggerContext,
    tester: TesterContext,
    researcher: ResearcherContext,
    uiExpert: UIExpertContext
}
export type ResearcherContext = {
    query: string
}

export type TesterContext = Record<string, never>

// session types for subagents
export type SubAgentsSession = {
    coder: CoderSession,
    debuggerr: DebuggerSession,
    tester: TesterSession,
    researcher: ResearcherSession,
    uiExpert: UIExpertSession
}
export type DebuggerSession = {
    taskId: number
    status: 'in_progress' | 'halted' | 'resolved';
    iterationCount: number;
    context: DebuggerContext;       // embeds it
    rawTranscript?: string;         // full LLM back-and-forth, for debugging/audit — you said this matters for Debugger specifically
    startedAt: string;
    lastUpdatedAt: string;
};
export type CoderSession = {
    taskId: number,
    status: 'in_progress' | 'halted' | 'done';
    iterationCount: number,
    context: CoderContext,
    startedAt: string;
    lastUpdatedAt: string;
}
export type TesterSession = {
    iterationCount: number,
    context: TesterContext,
    startedAt: string;
    lastUpdatedAt: string;
}
export type ResearcherSession = {
    taskId: number,
    iterationCount: number, 
    context: ResearcherContext,
    startedAt: string;
    lastUpdatedAt: string;
}
export type UIExpertSession = {
    taskId: number,
    iterationCount: number,
    context: UIExpertContext,
    startedAt: string;
    lastUpdatedAt: string;
}