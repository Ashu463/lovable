import Sandbox from "e2b"
import type { DeleteFile, Done, EditFile, Error, FetchDocs, Question, ReadFile, Research, RunCommand, Todo, ToolResult, WriteFile } from "../baml_client"
import type { CoderAgent } from "../agent/subagents/coder"
import type { DebuggerAgent } from "../agent/subagents/debugger"
import type { TesterAgent } from "../agent/subagents/tester"
import type { UIExpert } from "../agent/subagents/uiExpert"
import type { Researcher } from "../agent/subagents/researcher"

export interface MainLLMResponse{
    status: "toolCall" | "completed"
}

export interface Message{
    role: "user" | "assistant" | "toolCall",
    content: string, 
    timestamp: Date
}

// export interface ContextStruct{
//     systemPrompt: string, 
//     originalTask: string, 
//     semanticMem: string, 
//     episodicMem: string, 
//     compactedEntries: Pointer[],
//     recentRaw: Message[]
// }
export interface SessionData{
    current_step: string, 
    question?: Question,
    context_snapshot: string, 
    session_snapshot: string
}
export interface SSEBody{
    type: "llm_response" | "tool_call" | "tool_result" | "clarification_needed" | "completed" | "aborted"
    content?: string, 
    toolType?: string,
    iteration: number
}

export type Agent = CoderAgent | DebuggerAgent | TesterAgent | UIExpert | Researcher
export type ToolRes = WriteFile | ReadFile | RunCommand | DeleteFile | FetchDocs | Research | Done

interface CoderTaskInput {
  agentType: 'coder'
  boilerplate?: string
  task: Todo
}

interface DebuggerTaskInput {
  agentType: 'debugger'
  errors: Error[]
  toolResult: ToolRes
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

export type SubAgentTaskInput = CoderTaskInput | DebuggerTaskInput | TesterTaskInput | ResearchTaskInput
