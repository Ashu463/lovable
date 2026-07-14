class Error{
    fileName string
    error string
    source "tester" | "build" | "deploy"?
}
class DebuggingDone{
    action "done"
    editedFile FileEdit[]
    errors map<string, string>
}
class Fixes{
    error string
    fixSummary string
}
class DebuggerContext{
    originalError string
    fixHistory Fixes[]
}
// I'm sending errors at each iteration I guess which is not needed.
function DebuggerAgent(
    systemPrompt: string,
    errors: Error[],
    context: DebuggerContext,
    toolResult: ToolResult?
) -> ReadFile | RunCommand | WriteFile | Research | DebuggingDone{
    
    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{errors}} 
        {% if toolResult %}ToolResult: {{toolResult}}{%endif%}

        {{ctx.output_format}}
    "#
}