class AgentContext{}
function GenerateSubagentSummary(systemPrompt: string, subagentType: string, context: SubAgentsContext) -> string{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{subagentType}}
        {{context}}

        {{ctx.output_format}}
    "#
}