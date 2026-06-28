class WriteFile{
    action "writeFile"
    path string
    content string
}
class RunCommand{
    action "runCommand"
    command string
}
class FetchInfo{
    action "fetchInformation"
    query string
    library string // or framework
}
class Done{
    action "done"
    filesEdited FileEdit[]
}
class Research{
    action "research"
    query string
}
class CoderContext{
    type "writeFile" | "commandResult" | "infoResult" | "research"
    content string
}

function CoderAgent(
    prompt: string, 
    systemPrompt: string, 
    figmaBoilerPlate: string?, 
    context: CoderContext[]
) -> WriteFile | RunCommand | FetchInfo | Done | Research
    {
    // also this figmaBoilerPlate would be run for the first time iteration
    // that means if ths have any conversation history or chat id then don't call stitch MCP]
    client OpenAIGeneric
    
    prompt #"
        {{systemPrompt}}
        Task: {{prompt}} // ye genuinely user prompt hogi, in order to compare so that less deviation ho.; nope this should be task title or description
        Context: {{context}}
        {% if figmaBoilerPlate %}Boilerplate: {{ figmaBoilerPlate }}{% endif %}
        {{ctx.output_format}}
    "#
    
}