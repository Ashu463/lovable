class Error{
    fileName string
    error string
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
    context: Message[],
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