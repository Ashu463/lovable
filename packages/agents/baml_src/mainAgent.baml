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
    stopReason "completed" | "aborted" | "toolCall"
    content string
    toolCall ToolCall?
    questions Question[]?
}   

function MainLLMCall(systemPrompt: string, design: string?, userPrompt: string, context: Message[], semanticMem: string) -> LLMResponse{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{userPrompt}} - the specific, already-clarified request you're
  completing.
        {% if design %} - the design system chosen once at the start of
  this Run (layout, visual language, conventions). Never regenerate or
  second-guess this; treat it as settled. {% endif %}
        {{context}} - relevant current state of the app: files, prior
  decisions, whatever the orchestrator has determined is relevant to this
  task.
        {{semanticMem}} - Relevant user context for this build, Use this to calibrate scope, defaults, and how much you ask vs decide.

        {{ctx.output_format}}
    "#
}
function GenerateMainAgentSummary(systemPrompt: string, context: Message[]) -> string{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{context}} the turn-by-turn tool-call history for this task so far.


        {{ctx.output_format}}
    "#
}