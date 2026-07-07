
enum Agent {
  CoderAgent
  DebuggerAgent
  TesterAgent
  UIExpertAgent
  ResearcherAgent
}
function PlanComplexTask(systemPrompt: string, userPrompt: string) -> Todo[]{

    client "openai-generic/deepseek-v4-flash"
    prompt #"
        {{systemPrompt}}
        {{userPrompt}}

        {{ctx.output_format}}

    "#
}

function PlanSimpleTask(systemPrompt: string, userPrompt: string) -> string{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{userPrompt}}
        
        {{ctx.output_format}}
    "#
}