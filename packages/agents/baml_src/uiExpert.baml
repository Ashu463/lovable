
class Design{
    taskId int
    summary string
}
class UIExpertContext{
    userPrompt string
    priorDesigns Design[]
}

function FramePrompts(systemPrompt: string, userPrompt: string) -> string{
    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{userPrompt}}

        {{ctx.output_format}}
    "#
}
function UIExpertAgent() -> string{

}