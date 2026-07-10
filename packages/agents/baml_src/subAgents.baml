
function GenerateSummary(systemPrompt: string, context: Message[]) -> string{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{context}}

        {{ctx.output_format}}
    "#
}