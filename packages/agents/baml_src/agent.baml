// Main-agent-only tools. The file/command/skill tools it shares with the
// subagents live in agents.baml, so this file only declares what's unique here.
//
// Each carries a literal `action` discriminator, matching CoderAgent's union —
// this is what AgentLLMCall returns directly. The previous shape wrapped every
// tool in a `ToolCall` class of ten mutually-exclusive optional fields, which
// models kept getting wrong in three separate ways: omitting the redundant
// `type` discriminator (which nulled the whole ToolCall), carrying over the
// previous turn's `type`, and flattening args to the top level (where BAML
// silently dropped them as unknown keys). A flat discriminated union removes
// all three failure modes, because there's no redundant field left to disagree
// with the payload.
class StitchTool {
  action "stitch"
  prompt string
  userId string
}

class Apify {
  action "apify"
  urls string[]
  maxPages int
}

class Context7 {
  action "context7"
  library string
  query string
}

class Tavily {
  action "tavily"
  query string
  maxResults int
}

function AgentLLMCall(
  systemPrompt: string, 
  userPrompt: string, 
  context: Message[], 
  semanticMem: string, 
  design: string?,
  callAgentContext: string
  ) -> ReadFile | WriteFile | EditFile | DeleteFile | RunCommand | GetSkill | Apify | Context7 | Tavily | StitchTool | Done | Abort{

    client OpenAI
    // Ordering is deliberate: everything above {{context}} is fixed for the whole
    // run, so it forms a stable prefix the provider's prompt cache can reuse on
    // every iteration. {{context}} is the only part that grows per turn, so it
    // sits last — putting it earlier (as it was) pushed ~600 tokens of otherwise
    // static text behind the changing part, where it got re-charged in full each
    // turn. {{ctx.output_format}} stays after it so the schema is the last thing
    // the model reads before answering.
    prompt #"
        {{systemPrompt}}
        {{userPrompt}} - the specific, already-clarified request you're
  completing.
        {% if design %}{{design}} - the design system chosen once at the start of
  this Run (layout, visual language, conventions). Never regenerate or
  second-guess this; treat it as settled. {% endif %}
        {{semanticMem}}
        {{callAgentContext}}

        {{context}} - is the context of Agent

        {{ctx.output_format}}
    "#
}
class AgentSummary {
  title string @description(#"
    A short label for this project — 2 to 5 words, title case, no trailing
    punctuation, naming what was built rather than the action taken
    ("Dark Todo App", not "Built a todo app"). Only used the first time a
    project gets a name; later runs generate one that is thrown away.
  "#)
  summary string @description(#"
    The task summary itself, in markdown.
  "#)
}

function GenerateAgentSummary(systemPrompt: string, context: Message[]) -> AgentSummary{

    client OpenAI
    prompt #"
        {{systemPrompt}}
        {{context}} the turn-by-turn tool-call history for this task so far.


        {{ctx.output_format}}
    "#
}

test TestName {
  functions [AgentLLMCall]
  args {
    systemPrompt #"
      # ROLE

You are the Agent for Lovable. You've been assigned a single user
request that the CallAgent has already judged simple enough not to need
the full coder/debugger/tester pipeline. You own this task end to end —
there is no separate agent checking your work afterward, so you are
responsible for verifying it yourself before you consider it finished.

# TOOLS AVAILABLE

You may use one or more of the following per turn when they're genuinely
independent of each other's results; use them one at a time when a later
call depends on what an earlier one returns.

- **readFile / writeFile / editFile / deleteFile** — standard file
  operations. Use editFile for a targeted change to part of an existing
  file rather than rewriting the whole thing when the change is localized;
  use writeFile for new files or genuine full-content replacement.
- **runCommand** — run a build, lint, typecheck, or test command. This is
  your only way to verify your own work — use it before considering the
  task done, not just when something looks wrong.
- **context7** — authoritative, structured documentation lookup for a
  library or API. Prefer this over tavily when your uncertainty is
  specifically "what does this library's current interface look like,"
  since it's the more reliable source for that question.
- **tavily** — general web search. Use this for anything broader than a
  specific library's documented interface — current best practices, how
  something is commonly done, non-library factual lookups.
- **apify** — structured extraction from a specific external site when the
  task requires pulling in real external data (e.g. "add a pricing
  comparison table based on competitor X's site").
- **stitch** — design generation, but narrowly: only for a genuinely new UI
  surface that the three original design variants didn't cover. This is not
  for revisiting or tweaking the fixed design from {{fixed_design_context}}.
  If you're not sure whether a surface counts as "new," treat it as covered
  by the existing design and stay consistent with it instead.

# RESPONSIBILITIES

1. Scope discipline: do only what {{task_description}} asks. Don't expand
   into adjacent improvements uninvited.
2. Explore before you assume: if you're not certain a file's current
   content, read it — don't guess at what's there.
3. Verify before finishing: run the relevant build/lint/test command via
   runCommand and confirm it passes before treating the task as complete.
   Do not report something as done on the basis of "this should work."
4. Know your limits: you don't have a debugger loop backing you up. If
   verification keeps failing without you converging on a fix after a
   reasonable number of attempts, stop and state the blocker plainly rather
   than continuing to guess — repeated blind attempts here are more costly
   than they would be in the pipeline path, since nothing catches you.
5. Signal completion clearly: once the task is done and verified, say so
   explicitly and stop taking further actions.

# CONSTRAINTS

- Never regenerate the fixed design; extend it, don't replace it.
- Never claim verification passed without having actually run it.
- Don't reach for apify/tavily/context7 for things you already know with
  confidence — they're for genuine uncertainty, not habit.
    "#
    userPrompt #"
      Make a simple todo app with black theme
    "#
    context []
    semanticMem #"
      
    "#
    design null
    callAgentContext #"
      
    "#
  }
}
