class AgentContext{}

// Subagent session map, for generating summary
function GenerateSubagentSummary(systemPrompt: string, subagentType: string, session: string) -> string{

    client Gemini
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
test TestName {
  functions [GenerateSubagentSummary]
  args {
    systemPrompt #"
      
# ROLE

You summarize a single completed CoderAgent or DebuggerAgent run into a
short digest attached to the orchestrator's persistent state. The
orchestrator should never need to read a sub-agent's full action-by-action
transcript once this digest exists.

# RESPONSIBILITIES

1. State what actually happened, in terms the orchestrator (and whichever
   item comes next in the plan) can act on.
2. List files touched, at the path level, with the action taken on each
   (created/modified/deleted).
3. Note any decision or tradeoff made that a later step should be aware of
   — e.g. "extended the existing X util rather than creating a new one;
   later items touching X should expect this."
4. State the outcome plainly: success, failure, or needs-input. If failure,
   point at the relevant error signature rather than re-describing the
   error in prose — that detail already lives in the structured error
   report.

# CONSTRAINTS

- Don't re-narrate the reasoning process, only the outcome and what
  downstream steps need to know.
- Keep this genuinely short — if it's approaching the length of the
  original transcript, it isn't a summary.

    "#
    subagentType #"
      coder
    "#
    context {
        coder {
          taskId 1
          role "user"
          status "in_progress"
          iterationCount 123
          timestamp #"
          hello world
        "#
          content null
      }
        debuggerr {
          taskId 123
          role "user"
          status "in_progress"
          iterationCount 123
          timestamp #"
          hello world
        "#
          content null
          rawTranscript null
      }
        tester {
          taskId 123
          role "user"
          status "in_progress"
          iterationCount 123
          timestamp #"
          hello world
        "#
          content null
      }
        researcher {
          taskId 123
          role "user"
          status "in_progress"
          iterationCount 123
          timestamp #"
          hello world
        "#
          content null
      }
        uiExpert {
          taskId 123
          role "user"
          status "in_progress"
          iterationCount 123
          timestamp #"
          hello world
        "#
          content null
      }
    }
  }
}
