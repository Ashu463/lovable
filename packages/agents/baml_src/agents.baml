client OpenAIGeneric {
  provider "openai-generic"
  options {
    base_url env.LLM_BASE_URL
    api_key env.LLM_API_KEY
    model "deepseek-v4-flash"
    temperature 0.3
    response_format {
      type "json_object"
    }
  }
}
client Gemini {
  provider google-ai
  options {
    model "gemini-3.5-flash"
  }
}
client Groq {
  provider "openai-generic"

  options {
    base_url env.GROQ_BASE_URL
    api_key env.GROQ_API_KEY

    model "openai/gpt-oss-20b"

    temperature 0.3

    response_format {
      type "json_object"
    }
  }
}

// Groq's json_object mode requires an object at the JSON root, so it
// rejects top-level array responses (e.g. "[]") even when correct.
// Used for functions whose return type is an array.
client GroqArray {
  provider "openai-generic"

  options {
    base_url env.GROQ_BASE_URL
    api_key env.GROQ_API_KEY

    model "openai/gpt-oss-20b"

    temperature 0.3
  }
}
client<llm> OpenRouter {
  provider "openai-generic"

  options {
    base_url "https://openrouter.ai/api/v1"
    api_key env.OPENROUTER_API_KEY
    model "google/gemini-2.5-pro"

    // headers {
    //   "HTTP-Referer" "https://yourapp.com"
    //   "X-Title" "My BAML App"
    // }
  }
}
// retry_policy is what handles 429s: without it a single rate-limit
// response kills the whole run, since every agent call routes through here.
client OpenAI {
    provider "openai"
    retry_policy RateLimitBackoff
    options {
        model "gpt-4o-mini"
    }
}

// Tuned for rate limits rather than transient errors: OpenAI's per-minute
// windows need seconds of backoff, not the sub-second delays that suit a
// flaky-connection retry.
retry_policy RateLimitBackoff {
  max_retries 5
  strategy {
    type exponential_backoff
    delay_ms 1000
    multiplier 2
    max_delay_ms 30000
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
    client OpenAIGeneric
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
    agent "coder" | "uiExpert"
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
class GetSkill{
    action "getSkill"
    skillName string
}
class Abort{
    action "abort"
    reason string
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
    cwd string? // path relative to the project root, e.g. "server". Omit to run at the project root — don't prepend `cd ... &&` to command instead, the sandbox sets this directly.
}
class FileEditOp{
    oldString string @description(#"
      Text to find, copied from a version of this file you have read this session.

      How it is matched, so you can aim precisely:
      - Matching is literal on the file's raw text. Write the characters as they
        exist on disk: className="x", NOT className=\"x\". Backslash-escaping the
        quotes is the most common reason an edit finds nothing.
      - It must match exactly one place. A single short line like </div> or <div>
        will match many times and be rejected — include the surrounding lines that
        make it unique.
      - Leading indentation and trailing whitespace are forgiven, so you do not
        need to reproduce them exactly. What must match is the text itself.
      - If the file's overall shape is wrong (leftover HTML, duplicated blocks,
        content after the final export), do not try to patch it here — use
        writeFile to replace the whole file.
    "#)
    newString string @description(#"
      Replacement text, re-indented for you to match the depth of what it replaces.
      Use an empty string to delete the matched region.
    "#)
}
class EditFile{
    action "editFile"
    path string
    edits FileEditOp[] @description(#"
      All the changes you want to make to this file, applied in order. Batch
      every change to one file into a single call rather than one call per edit.
    "#)
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
    skills Skill[]
}
class TesterContext{
    skills Skill[]
}
class Skill{
    name string
    description string
    content string?
}
class SubAgentsContexts{
    coder CoderContext
    debuggerr DebuggerContext // this is not a typo, I made this intentionally 
                            // because baml have debugger keyword and they don't let me use that.
    tester TesterContext
    researcher ResearcherContext
    uiExpert UIExpertContext
}
type SubAgentsContext = CoderContext | DebuggerContext | TesterContext | ResearcherContext | UIExpertContext

function CallAgentSummary(systemPrompt: string, summaries: string[]) -> string{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{summaries}} - full Run history: the original request, the
fixed design decision, every subsequent user message with its complexity
verdict and which path handled it, and the state of whichever delegate is
currently active.

        {{ctx.output_format}}
    "#
}
 