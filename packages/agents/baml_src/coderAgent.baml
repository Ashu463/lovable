
class FetchDocs{
    action "fetchDocs"
    query string
    library string // or framework
}
class Done{
    action "done"
    filesEdited FileEdit[]
}

class CoderContext{
    task string
    dependentSummary TaskSummary[]
    repoTree string
    skills Skill[]
    recentTurns Message[]
}

function CoderAgent(
    systemPrompt: string,
    context: CoderContext,
) -> WriteFile | ReadFile | EditFile | RunCommand | DeleteFile | Research | GetSkill | Done | Abort
    {
    client GroqArray

    prompt #"
        {{systemPrompt}}
        Whatever else {{context}} carries about the current codebase state.
        {{ctx.output_format}}
    "#

}
test TestName {
  functions [CoderAgent]
  args {
    systemPrompt #"
      You are a coder agent and
    "#
    context {
        task "Add a hello world route"
        dependentSummary []
        repoTree #"
        hello world
      "#
        skills []
        recentTurns []
    }
  }
}
