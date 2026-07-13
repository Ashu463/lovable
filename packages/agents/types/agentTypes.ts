import type { Screen } from "@google/stitch-sdk"
import type { Error, Message, PlannerTodo } from "../baml_client"

export interface AgentResponse{
    
}
export interface ResearcherResponse{
    query: string
    results: BraveRes | ApifyRes
}
interface BraveRes{
    type: string
    result: Result[]
}
interface Result{
    title: string
    url: string
    description: string
    pageAge?: Date // mandatory in case of brave result
}
interface ApifyRes{
    status: string
    itemCount: number
    scrapedRes: Result[]
}
export interface CoderRequest{
    prompt: string // this could be user prompt or task description
    figmaBoilerPlate: string
}
export interface CoderResponse{
    status: string
    editedFiles: FileEdit[]
}
interface FileEdit{
    fileName: string
    summary: string
}
export interface DebuggerRequest{
    errors: Map<string, string> // map<errors, filename> 
}
export interface DebuggerResponse{
    status: string
    editedFile: FileEdit[]
}
export interface TesterResponse{

}

export interface SandboxRes{
    
}
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
interface Session{
    sessionId: string, 
    session: Message[]
}

export type OrchestratorSSE = {
    taskCompleted: string,
    status: "failed" |  "success",
    summary: string,
    errors: Error | null
}
export type OrchestratorResponse = {
    design: Screen,
    todos?: PlannerTodo[]
    projectUrl: string,
    r2Location: string,
    summary: string
}