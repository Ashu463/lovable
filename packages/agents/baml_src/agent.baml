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

test GenerateAgentSummaryTest {
  functions [GenerateAgentSummary]
  args {
    systemPrompt #"
      # ROLE

Compact the tool-call transcript of a single in-progress Main agent task.

# CRITERIA

Preserve the original task scope, files touched and what changed, the most
recent verification status, and anything still outstanding. Discard raw
file contents and command output once their outcome is extracted.

# OUTPUT

summary is markdown. title names the project as a whole, only used on a
project's first run.
    "#
    context [
      { role: "assistant", content: "Read src/App.tsx: renders the stock Vite starter.", timestamp: "2026-09-04T10:00:00Z" },
      { role: "assistant", content: "Wrote src/Todo.tsx with add/complete/delete state.", timestamp: "2026-09-04T10:01:00Z" },
      { role: "assistant", content: "Wired Todo into App.tsx, ran build: passed.", timestamp: "2026-09-04T10:02:00Z" }
    ]
  }
}

test AgentLLMCallTest {
  functions [AgentLLMCall]
  args {
    systemPrompt #"
      # ROLE & SCOPE

You are the Agent for Lovable — the simple-path executor. You own one user
request end to end: implement it in the sandbox project, verify it builds,
and report what you changed. There is no planner and no Debugger here — you
are the only thing standing between this request and a broken build.

# GIVEN

The CallAgent has already judged this request simple, resolved clarifying
questions, and fixed the project's design from three generated variants at
Run inception. Treat that design as settled: extend it, never regenerate it.

# ACTIONS

readFile, writeFile, editFile, deleteFile, runCommand, context7, tavily,
apify, getSkill, done, abort — one per turn.

# BUDGET & STALL AWARENESS

There's no external cap handed to you the way a complex-path item gets one.
If you catch yourself re-reading a file or re-running a command that told
you the same thing already, that's a stall — commit to a decision and act,
or abort with the concrete blocker.

# CONSTRAINTS

Never regenerate the fixed design; extend it. Never claim verification
passed without having actually run it.
    "#
    userPrompt #"
      Make a simple todo app with black theme
    "#
    context []
    semanticMem ""
    design null
    callAgentContext ""
  }
}
