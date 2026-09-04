
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
    // Fuller intent from the planner (the "why" behind task) and a soft
    // tool-call budget hint. Both fixed at task start, same as task itself.
    description string
    expectedToolCalls int
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
    client OpenAIGeneric

    prompt #"
        {{systemPrompt}}

        # CURRENT ITEM

        {{context.task}}
        {{context.description}} - the fuller brief behind that task.
        expectedToolCalls: {{context.expectedToolCalls}} - a soft budget for
  this item, not a hard cap.

        Whatever else {{context}} carries about the current codebase state
  (repoTree, skills, dependentSummary, recentTurns).

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
        description "Add a GET /hello route that returns a JSON greeting, used by the health-check page."
        expectedToolCalls 4
        dependentSummary []
        repoTree #"
        hello world
      "#
        skills []
        recentTurns []
    }
  }
}
