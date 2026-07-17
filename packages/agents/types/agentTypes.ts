import type { Screen } from "@google/stitch-sdk"
import type { Design, Error, Message, PlannerTodo, Question } from "../baml_client"


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
// export type OrchestratorResponse = {
//     success: 'failed' | 'pass' | 'in_progress'
//     design: Screen,
//     todos?: PlannerTodo[],
//     projectUrl?: string,
//     summary: string
// }
// clarification_needed, select_design, 
export type OrchestratorResponse = 
      clarification_needed 
    | design_needed 
    | {status: 'error', reason: string, data?: any}
    | {status: 'completed', design: string, todos: PlannerTodo[], previewUrl: string, summary: string}
export type clarification_needed = {
    status: 'clarification_needed',
    questions: Question[]
}
export type design_needed = {
    status: 'select_design',
    designs: string[]
}
// export interface BootstrapResponse{
//     status: 'ready_to_act' | 'select_design' | 'clarification_needed' | 'error'
//     isComplex: boolean,
//     designs?: Screen[],
//     selectedDesign?: Screen,
//     questions?: Question[]
//     error?: string
// }
export type BootstrapResponse = clarification_needed | design_needed 
    | {status: 'error', error: string} 
    | {status: 'pass', isComplex: boolean, updatedPrompt: string, questions?: Question[], selectedDesign?: Screen}

export interface Answers{
    question: string, 
    answer: string
}