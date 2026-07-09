import Sandbox from "e2b"
import type { DeleteFile, EditFile, Question, ReadFile, RunCommand, WriteFile } from "../baml_client"

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