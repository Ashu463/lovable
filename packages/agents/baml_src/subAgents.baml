class AgentContext{}
function GenerateSummary(systemPrompt: string, context: SubAgentsContext) -> string{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{context}}

        {{ctx.output_format}}
    "#
}