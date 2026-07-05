class Error{
    fileName string
    error string
}
class Errors{
    actions "errors"
}
class DebuggingDone{
    action "done"
    editedFile FileEdit[]
    errors map<string, string>
}

// I'm sending errors at each iteration I guess which is not needed.
function DebuggerAgent(
    systemPrompt: string,
    errors: Error[], 
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