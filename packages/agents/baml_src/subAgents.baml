class AgentContext{}

// Subagent session map, for generating summary
function GenerateSubagentSummary(systemPrompt: string, subagentType: string, session: string) -> string{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{subagentType}}
        {{session}}

        {{ctx.output_format}}
    "#
}
class SessionMap {
  coder CoderSession
  debuggerr DebuggerSession
  tester TesterSession
  researcher ResearcherSession
  uiExpert UIExpertSession
}

type Role = "user" | "assistant" | "tool"
type Status = "in_progress" | "halted" | "resolved" | "done"

class DebuggerSession {
  taskId int
  role Role
  status Status
  iterationCount int
  timestamp string

  content string?
  rawTranscript string?
}

class CoderSession {
  taskId int
  role Role
  status Status
  iterationCount int
  timestamp string

  content string?
}

class TesterSession {
  taskId int
  role Role
  status Status
  iterationCount int
  timestamp string

  content string?
}

class ResearcherSession {
  taskId int
  role Role
  status Status
  iterationCount int
  timestamp string

  content string?
}

class UIExpertSession {
  taskId int
  role Role
  status Status
  iterationCount int
  timestamp string

  content string?
}
test GenerateSubagentSummaryTest {
  functions [GenerateSubagentSummary]
  args {
    systemPrompt #"
      # ROLE

Summarize a single completed CoderAgent, DebuggerAgent, or UIExpert item's
run into a short digest attached to the CallAgent's persistent state.

# GIVEN

This digest becomes dependentSummary for whatever later planned item
depends on this one, and feeds into the Run-level context above it.

# CRITERIA

State what actually happened, list files touched with the action taken on
each, note any decision a later step should be aware of, and state the
outcome plainly — success, failure, or needs-input.

# CONSTRAINTS

Don't re-narrate the reasoning process. Keep this genuinely short — if it's
approaching the length of the original transcript, it isn't a summary.
    "#
    subagentType #"
      coder
    "#
    session #"
      [
        {
          "taskId": 1,
          "role": "assistant",
          "status": "done",
          "iterationCount": 3,
          "timestamp": "2026-07-21T08:00:00Z",
          "content": "Created src/routes/hello.ts with a hello world route."
        }
      ]
    "#
  }
}
