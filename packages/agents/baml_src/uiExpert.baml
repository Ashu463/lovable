
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
    client OpenAIGeneric
    prompt #"
        {{ _.role("system") }}
        {{systemPrompt}}

        # DESIGN GUIDELINES

        These are the design-system and responsive-rules skills, plus
        layout-patterns and asset-policy. This is a single-shot call with no
        follow-up turn, so they are attached in full rather than fetched on
        demand. Treat them as binding.

        {# Looping renders each skill as readable markdown. Interpolating the
           array directly dumped escaped JSON — thousands of tokens of
           content fields full of literal backslash-n escapes that the model
           had to parse back out before it could use any of it. #}
        {% for skill in skills %}
        ## {{ skill.name }}
        {{ skill.description }}

        {{ skill.content }}
        {% endfor %}

        {{ _.role("user") }}
        # WHAT'S BEING BUILT

        This has already passed the complexity and clarification checks. Where
        it records answers to clarifying questions, those answers are the
        user's explicit intent — weight them above your own defaults.

        {{userPrompt}}

        {# semanticMem was declared as a parameter and passed by uiExpert.ts,
           but never rendered here, so everything remembered about this user's
           prior preferences was silently dropped at the design step. #}
        {% if semanticMem %}
        # WHAT WE KNOW ABOUT THIS USER

        Preferences and context carried over from earlier work. Apply them
        unless this request contradicts them.

        {{semanticMem}}
        {% endif %}

        {{ctx.output_format}}
    "#
}
function UIExpertAgent() -> string{

}