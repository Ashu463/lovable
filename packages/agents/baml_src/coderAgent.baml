
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
}

function CoderAgent(
    systemPrompt: string, 
    figmaBoilerPlate: string?, 
    context: CoderContext,
) -> WriteFile | ReadFile | EditFile | RunCommand | DeleteFile | Research | Done  
    {
    // also this figmaBoilerPlate would be run for the first time iteration
    // that means if ths have any conversation history or chat id then don't call stitch MCP]
    client OpenAIGeneric
    
    prompt #"
        {{systemPrompt}}
        Whatever else {{context}} carries about the current codebase state.
        
        {% if figmaBoilerPlate %}{{ figmaBoilerPlate }} - Stitch-derived design reference/boilerplate for
  this item, when the item touches UI. Treat this as the source of truth
  for layout and visual structure; implement it, don't redesign it.{% endif %}
        {{ctx.output_format}}
    "#
    
}
test TestName {
  functions [CoderAgent]
  args {
    systemPrompt #"
      You are a coder agent and 
    "#
    figmaBoilerPlate ""
    context {
        task "Add a hello world route"
        dependentSummary []
        repoTree #"
        hello world
      "#
    }
  }
}
