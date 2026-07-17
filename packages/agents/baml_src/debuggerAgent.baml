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
    repoTree string
    originalError string
    fixHistory Fixes[]
}
// I'm sending errors at each iteration I guess which is not needed.
function DebuggerAgent(
    systemPrompt: string,
    errors: Error[],
    context: DebuggerContext,
    toolResult: ToolResult?
) -> ReadFile | RunCommand | WriteFile | EditFile | Research | DebuggingDone{
    
    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{errors}} - what failed: the command that failed and its output,
  possibly already structured into error type, location, message, and candidate causes.

        {% if toolResult %}ToolResult: {{toolResult}}{%endif%}

        {# {{prior_fix_attempts}} — if this is not your first attempt at this item,
  what was tried before and what happened as a result. A non-empty list
  here means your previous approach did not resolve the issue — read what
  was already tried before proposing another fix. #}
        {{ctx.output_format}}
    "#
}