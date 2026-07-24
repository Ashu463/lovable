
class Design{
    taskId int
    summary string
}
class UIExpertContext{
    userPrompt string
    priorDesigns Design[]
}

class DesignVariants{
    prompts string[]
}
function FramePrompts(systemPrompt: string, userPrompt: string, semanticMem: string) -> DesignVariants{
    client Gemini
    prompt #"
        {{systemPrompt}}
        {{userPrompt}} - what's being built, already past complexity and
  clarification checks.
    {# {{target_surfaces}} — which pages/components are in initial scope. #}

        {{ctx.output_format}}
    "#
}
function UIExpertAgent() -> string{

}