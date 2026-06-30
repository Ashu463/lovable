class WriteFile{ // write file or edit file is treated to be same
    action "writeFile"
    path string
    content string
}
class ReadFile{
    action "read"
    path string
}
class DeleteFile{
    action "delete"
    path string
}
class RunCommand{
    action "runCommand"
    command string
}
class FetchDocs{
    action "fetchDocs"
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
    type "writeFile"| "readFile" | "commandResult" | "infoResult" | "research" 
    content string
}
class Message {
    // observations: string[]
    // notes: string[]
    // completedTasks: string[]
}
function CoderAgent(
    prompt: string, 
    systemPrompt: string, 
    figmaBoilerPlate: string?, 
    context: Message[],
) -> WriteFile | ReadFile | RunCommand | DeleteFile | FetchDocs | Research | Done  
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