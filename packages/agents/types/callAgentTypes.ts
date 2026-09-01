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

export type CallAgentSSE = {
    taskCompleted?: string,
    status: "failed" |  "success",
    summary: string,
    errors: Error | null | string
}
// export type CallAgentResponse = {
//     success: 'failed' | 'pass' | 'in_progress'
//     design: Screen,
//     todos?: PlannerTodo[],
//     projectUrl?: string,
//     summary: string
// }
// clarification_needed, select_design, 
export type CallAgentResponse =
      clarification_needed
    | design_needed
    | ui_preference_needed
    | {status: 'error', reason: string, data?: any}
    | {status: 'completed', previewUrl: string, summary: string}
    | {status: 'conversation', reply: string}
    // Build work now runs as an Inngest function, dispatched and forgotten —
    // this is what Execute() itself resolves with. The real outcome (this
    // same 'completed' shape, or 'error') arrives later via the run_completed/
    // run_failed SSE events the Inngest function emits when it finishes.
    | {status: 'in_progress', runId: string}
export type clarification_needed = {
    status: 'clarification_needed',
    questions: Question[],
    alreadySaved?: boolean
}
export type DesignOption = {
    id: string,
    htmlContent: string
}
export type design_needed = {
    status: 'select_design',
    designs: DesignOption[],
    alreadySaved?: boolean
}
export type UIPreferenceQuestion = {
    id: string,
    question: string,
    options: string[]
}
// Answered pairs, not a bare string — the whole set is carried into every
// UIExpert task, and a question is meaningless without its answer.
export type UIPreferenceQA = {
    question: string,
    answer: string
}
export type ui_preference_needed = {
    status: 'ui_preference_needed',
    questions: UIPreferenceQuestion[],
    alreadySaved?: boolean
}

export type BootstrapResponse = clarification_needed | design_needed | ui_preference_needed
    | {status: 'error', error: string}
    | {status: 'pass', isComplex: boolean, updatedPrompt: string, questions?: Question[], selectedDesign?: string}

export interface Answers{
    question: string, 
    answer: string
}