
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
    dependentSummary TaskSummary[]
    repoTree string
}

function CoderAgent(
    systemPrompt: string, 
    figmaBoilerPlate: string?, 
    context: CoderContext[],
) -> WriteFile | ReadFile | RunCommand | DeleteFile | FetchDocs | Research | Done  
    {
    // also this figmaBoilerPlate would be run for the first time iteration
    // that means if ths have any conversation history or chat id then don't call stitch MCP]
    client OpenAIGeneric
    
    prompt #"
        {{systemPrompt}}
        Context: {{context}}
        
        {% if figmaBoilerPlate %}Boilerplate: {{ figmaBoilerPlate }}{% endif %}
        {{ctx.output_format}}
    "#
    
}