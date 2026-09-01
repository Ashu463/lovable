class Error{
    fileName string
    error string
    source "tester" | "build" | "deploy"?
    taskId int?
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
    skills Skill[]
    recentTurns Message[]
}
// I'm sending errors at each iteration I guess which is not needed.
function DebuggerAgent(
    systemPrompt: string,
    errors: Error[],
    context: DebuggerContext,
    toolResult: ToolResult?
) -> ReadFile | RunCommand | WriteFile | EditFile | Research | GetSkill | DebuggingDone | Abort{
    
    client GroqArray
    prompt #"
        {{systemPrompt}}
        {{errors}} - what failed: the command that failed and its output,
  possibly already structured into error type, location, message, and candidate causes.
  When an error carries a taskId, it's attributed to a specific planned task
  whose merged changes touched that file — a strong hint at where the bug
  was introduced, not a guarantee (a shared file can be touched by more than
  one task).

        {% if toolResult %}ToolResult: {{toolResult}}{%endif%}

        {{context}} - the repo tree plus your own history on this item:
  recentTurns is every tool call you have already made and what it returned,
  and fixHistory is what was already attempted and the result. If these are
  non-empty, your previous approach has not resolved the issue yet — read
  them before acting. Never repeat a tool call that already appears in
  recentTurns; you already have that result, use it and take the next step.

        {{ctx.output_format}}
    "#
}