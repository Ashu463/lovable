
class Design{
    taskId int
    summary string
}
class UIExpertContext{
    userPrompt string
    priorDesigns Design[]
    skills Skill[]
}

class DesignVariants{
    prompts string[]
}
function FramePrompts(systemPrompt: string, userPrompt: string, semanticMem: string, skills: Skill[]) -> DesignVariants{
    client Gemini
    prompt #"
        {{systemPrompt}}
        {{userPrompt}} - what's being built, already past complexity and
  clarification checks.
    {# {{target_surfaces}} — which pages/components are in initial scope. #}
        {{skills}} - design-system and responsive-rules (always attached),
  plus layout-patterns/asset-policy (this is a single-shot call with no
  follow-up turn, so these are attached in full rather than fetched on demand).

        {{ctx.output_format}}
    "#
}
function UIExpertAgent() -> string{

}