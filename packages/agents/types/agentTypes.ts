import type { Screen } from "@google/stitch-sdk"
import type { Error, Message, PlannerTodo } from "../baml_client"


// -----Updated types, Jul 7 2026 -------

export interface User{
    userId: string
    projects: Project[],
    semanticMem: string,
}
export interface Project{
    projectId: string, 
    sessions: Message[],
    context: Message[]
}

export type OrchestratorSSE = {
    taskCompleted?: string,
    status: "failed" |  "success",
    summary: string,
    errors: Error | null | string
}
export type OrchestratorResponse = {
    success: 'failed' | 'pass'
    design: Screen,
    todos?: PlannerTodo[]
    projectUrl?: string,
    summary: string
}

export interface AgentRequest{
    provider: string,
    model: string
    key: string
    prompt: string
}
export interface AgentResult {
    summary: string;
    artifacts: string[];
    confidence: number;
}

export interface BootstrapResponse{
    userPrompt: string, 
    isComplex: boolean,
    design: Screen
}
export interface Answers{
    question: string, 
    answer: string
}