client OpenAIGeneric {
  provider "openai-generic"
  options {
    base_url env.LLM_BASE_URL
    api_key env.LLM_API_KEY
    model "deepseek-v4-flash"
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

function StreamOneAgent(userPrompt: string,  systemPrompt: string) -> AgentResponse{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{userPrompt}}

        {{ctx.output_format}}
    "#
}

class FinalResponse{
    status "success" | "failed"
    previewUrl string?
    deployUrl string?
}
function OrchestrateAgent(systemPrompt: string) -> FinalResponse{
    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}

        {{ctx.output_format}}
    "#

}
function ResearchAgent(query: string, systemPrompt: string, searchWay: string) -> ResearcherResponse{
    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{query}}
        {{searchWay}}

        {{ctx.output_format}}
    "#
}


function BugFinder(errors: string, systemPrompt: string) -> Error[]{
    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{errors}}

        {{ctx.output_format}}
    "#
}

function TesterAgent(userPrompt: string, systemPrompt: string, ) -> TesterResponse{
    // just compare the concised version of whatever is built till now and the actual user prompt
    // then find the similarty score of both, if > 75 then okay
    // else loop in again the coder for fixing this. 
    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{userPrompt}}

        {{ctx.output_format}}
    "#
}
class Todo{
    id int
    task string
    agent string
    status "pending" | "completed"
    dependency int[]
}
class TaskComplexity{
    complexity bool
    POA Todo[] | string
}
function GetTodos(userPrompt: string, systemPrompt: string) -> TaskComplexity{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{userPrompt}}

        {{ctx.output_format}}
    "#
}

// ---New Edit 5/July/26, this would be acting as utils for baml types
class Research{
    action "research"
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
    action "edit"
    fileName string
    content string
}
class ToolResult{
    success bool
    content FileEdit[]?
}