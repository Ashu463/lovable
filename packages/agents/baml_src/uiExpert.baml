

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