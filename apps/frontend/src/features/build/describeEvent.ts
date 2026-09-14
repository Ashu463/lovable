import type { CallAgentEvent } from "../../../../../packages/agents/agent/events";

export function describeEvent(event: CallAgentEvent): string {
  switch (event.type) {
    case "call_agent_started":
      return "Planning the build…";
    case "agent_success":
      return "Agent finished its task.";
    case "agent_tool_call":
      return `Running ${event.toolName}…`;
    case "agent_progress":
      return event.step === "toolCall"
        ? `Calling ${event.toolCall ?? "a tool"}…`
        : event.step === "llm_completed"
          ? "Model responded."
          : "Model call failed.";
    case "designs_generating":
      return `Generating ${event.count} design directions — this takes about a minute.`;
    case "design_progress":
      return event.message;
    case "subagent_started":
      return event.agent === "debuggerr"
        ? "Debugger stepped in to fix a failing check…"
        : event.agent === "tester"
          ? "Verifying the build…"
          : `${event.agent} started…`;
    case "subagent_progress":
      return event.subagentSummary ?? `${event.agent} is working…`;
    case "subagent_completed":
      return event.agent === "debuggerr"
        ? `Debugger done: ${event.summary}`
        : event.agent === "tester"
          ? event.summary
          : `${event.agent} finished: ${event.summary}`;
    case "call_agent_completed":
      return event.summary;
    default:
      return "Working…";
  }
}
