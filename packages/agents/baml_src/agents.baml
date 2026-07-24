client OpenAIGeneric {
  provider "openai-generic"
  options {
    base_url env.LLM_BASE_URL
    api_key env.LLM_API_KEY
    model "deepseek-v4-flash"
  }
}
client Gemini {
  provider google-ai
  options {
    model "gemini-3.5-flash"
  }
}

class AgentResponse{
    
}
class ResearcherResponse{
    query string
    result BraveRes | ApifyRes
}

class BraveRes{
    type string
    result BraveResult[]
}
class BraveResult{
    title string
    url string
    description string
    pageAge string // datetime
}
class ApifyRes{
    status string
    itemcount int 
    scrapeRes ItemRes[]
}
class ItemRes{
    title string
    description string
    url string
}


class TesterResponse{

}

function ResearchAgent(query: string, systemPrompt: string, searchWay: string) -> ResearcherResponse{
    client Gemini
    prompt #"
        {{systemPrompt}}
        {{query}}
        {{searchWay}}

        {{ctx.output_format}}
    "#
}



class PlannerTodo{
    id int
    task string
    agent "coder" | "debuggerr" | "tester" | "researcher" | "uiExpert"
    status "pending" | "completed"
    dependency int[]
    designNeeded bool
}
class TaskComplexity{
    complexity bool
    POA PlannerTodo[] | string
}

// ---New Edit 5/July/26, this file would be acting as utils for baml types
class Research{
    action "research"
    searchType WebSearch | WebScrape | DocsSearch
}
class WebScrape{
    type "webScrape"
    urls string[]
    maxPages int
}
class WebSearch{
    type "webSearch"
    query string
    maxResults int
}
class DocsSearch{
    type "docsSearch"
    library string
    query string
}
class FileEdit{
    fileName string
    summary  string
}
class WriteFile{ // write file or edit file is treated to be same
    action "writeFile"
    path string
    content string
}
class ReadFile{
    action "read"
    path string
}
class DeleteFile{
    action "delete"
    path string
}
class RunCommand{
    action "runCommand"
    command string
}
class EditFile{
    action "editFile"
    path string
    content string
}
class ToolResult{
    success bool
    content FileEdit[]?
}
class TaskSummary{
    taskId string
    summary string
}
enum ContextType{
    CoderContext
    DebuggerContext
    TesterContext
    UIExpertContext
    ResearcherContext
}
class ResearcherContext{
    query string
}
class TesterContext{}

class SubAgentsContexts{
    coder CoderContext
    debuggerr DebuggerContext // this is not a typo, I made this intentionally 
                            // because baml have debugger keyword and they don't let me use that.
    tester TesterContext
    researcher ResearcherContext
    uiExpert UIExpertContext
}
type SubAgentsContext = CoderContext | DebuggerContext | TesterContext | ResearcherContext | UIExpertContext

function OrchestratorSummary(systemPrompt: string, summaries: string[]) -> string{

    client Gemini
    prompt #"
        {{systemPrompt}}
        {{summaries}} - full Run history: the original request, the
fixed design decision, every subsequent user message with its complexity
verdict and which path handled it, and the state of whichever delegate is
currently active.

        {{ctx.output_format}}
    "#
}