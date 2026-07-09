enum ToolType {
  Apify
  Context7
  Tavily
  Stitch
  ReadFile
  WriteFile
  EditFile
  RunCommand
  DeleteFile
  QnA
}
class ToolCall {
  type ToolType

  apify Apify?
  context7 Context7?
  tavily Tavily?
  stitch StitchTool?
  readFile ReadFile?
  writeFile WriteFile?
  editFile EditFile?
  runCommand RunCommand?
  deleteFile DeleteFile?
}
class StitchTool {
  prompt string
  userId string
}

class Apify {
  urls string[]
  maxPages int
}

class Context7 {
  library string
  query string
}

class Tavily {
  query string
  maxResults int
}
class LLMResponse{
    stopReason "completed" | "aborted" | "toolCall" | "QnA"
    content string
    toolCall ToolCall?
    questions Question[]?
}   
    type: "llm_response" | "tool_call" | "tool_result" | "clarification_needed" | "completed" | "aborted"

function MainLLMCall(systemPrompt: string, userPrompt: string, context: Message[], semanticMem: string) -> LLMResponse{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{userPrompt}}
        {{context}}

        {{ctx.output_format}}
    "#
}