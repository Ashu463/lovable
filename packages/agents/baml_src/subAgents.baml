class AgentContext{}

// Subagent session map, for generating summary
function GenerateSubagentSummary(systemPrompt: string, subagentType: string, context: SessionMap) -> string{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{subagentType}}
        {{context}}

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

