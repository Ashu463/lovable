
export interface Message {
    observations: string[]
    notes: string[]
    completedTasks: string[]
}
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
export interface Context{
    
}

// -----Updated types, Jul 7 2026 -------
export interface 