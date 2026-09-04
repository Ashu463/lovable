
enum Agent {
  CoderAgent
  DebuggerAgent
  TesterAgent
  UIExpertAgent
  ResearcherAgent
}
class PlannedScreen {
  id string
  name string
  designBrief string
}

// Call 1 of the two-phase planner: enumerate the screens the request needs.
// Cheap and fast so the design (Stitch) phase can start immediately while
// PlanTasks runs concurrently. NOT wired yet — added as a contract.
function EnumerateScreens(systemPrompt: string, userPrompt: string, context: string) -> PlannedScreen[]{
    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{userPrompt}} - the request to enumerate screens for.
        {{context}} - current app state and prior decisions, including any
  screens that already have designs from earlier runs (don't re-enumerate
  those as new).

        {{ctx.output_format}}
    "#
}

// Call 2 of the two-phase planner: the task DAG, anchored to the screens from
// EnumerateScreens. A uiExpert item's designRef MUST be one of the passed
// screen ids. NOT wired yet — added as a contract.
function PlanTasks(systemPrompt: string, userPrompt: string, context: string, screens: PlannedScreen[]) -> PlannerTodo[]{
    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{userPrompt}} - the request to plan for.
        {{context}} - current app state and prior decisions.
        {{screens}} - the screens enumerated for this request. Every uiExpert
  item must set designRef to one of these screen ids; coder items leave it null.

        {{ctx.output_format}}
    "#
}
