
enum Agent {
  CoderAgent
  DebuggerAgent
  TesterAgent
  UIExpertAgent
  ResearcherAgent
}
function PlanComplexTask(systemPrompt: string, userPrompt: string, context: string) -> PlannerTodo[]{
// context here is the orchestrator context sended with main agent, subagent, and planner task
    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{userPrompt}} - the request to plan for, already past complexity and
  clarification checks.
        {{context}} - current app state and prior decisions.

        {{ctx.output_format}}

    "#
}