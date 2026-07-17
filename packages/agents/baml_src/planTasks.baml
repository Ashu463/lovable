
enum Agent {
  CoderAgent
  DebuggerAgent
  TesterAgent
  UIExpertAgent
  ResearcherAgent
}
function PlanComplexTask(systemPrompt: string, userPrompt: string, design: string, context: string) -> PlannerTodo[]{
// context here is the orchestrator context sended with main agent, subagent, and planner task
    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{userPrompt}} - the request to plan for, already past complexity and
  clarification checks.
        {{design}} - the design system already chosen for this Run.
        {{context}} - current app state and prior decisions.

        {{ctx.output_format}}

    "#
}