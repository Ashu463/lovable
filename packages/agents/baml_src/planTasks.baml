
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
// PlanTasks runs concurrently.
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

class PlanTasksOutput {
  reasoning string @description(#"
    A short paragraph on the decomposition strategy — how you split the
    request, why the ordering/dependencies are what they are. Written once
    for the whole plan, before todos, not repeated per item.
  "#)
  todos PlannerTodo[]
}

// Call 2 of the two-phase planner: the task DAG, anchored to the screens from
// EnumerateScreens. A uiExpert item's designRef MUST be one of the passed
// screen ids.
function PlanTasks(systemPrompt: string, userPrompt: string, context: string, screens: PlannedScreen[]) -> PlanTasksOutput{
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

test PlanTasksTest {
  functions [PlanTasks]
  args {
    systemPrompt #"
      # ROLE

You are call two of the planner: turn a request already judged complex into
a PlannerTodo[] DAG for Coder and UIExpert to execute one item at a time.

# GIVEN

Call one (EnumerateScreens) already ran and fixed the screen list you're
given — a separate step is generating each screen's design concurrently
with you, keyed by screen id.

# CRITERIA

Reason through the shape of the decomposition first, then emit items. Emit
one uiExpert item per screen that doesn't already have a design; set its
designRef to that screen's id. Emit the corresponding Coder item(s) for that
screen's behavior with a dependency on the uiExpert item's id. Write
description as the fuller brief the executor needs, and expectedToolCalls
as a realistic effort estimate.

# CONSTRAINTS

The sandbox is a Vite + React + TypeScript app — every item must assume
.tsx components wired into src/App.tsx, never a standalone HTML page.

# OUTPUT

reasoning is one short paragraph on the decomposition strategy, written once
for the whole plan before todos.
    "#
    userPrompt #"
      Add a login screen with email/password and a dashboard that shows the
      logged-in user's name.
    "#
    context #"
      Fresh project, no prior runs, no existing screens.
    "#
    screens [
      {
        id "login"
        name "Login"
        designBrief "Email/password form with a submit button."
      },
      {
        id "dashboard"
        name "Dashboard"
        designBrief "Welcome header showing the logged-in user's name."
      }
    ]
  }
}
