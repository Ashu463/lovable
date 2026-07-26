import type { OrchestratorEvent } from "../../../../../packages/agents/agent/events";

export function describeEvent(event: OrchestratorEvent): string {
  switch (event.type) {
    case "orchestrator_agent_started":
      return "Planning the build…";
    case "main_agent_success":
      return "Agent finished its task.";
    case "main_agent_tool_call":
      return `Running ${event.toolName}…`;
    case "main_agent_progress":
      return event.step === "toolCall"
        ? `Calling ${event.toolCall ?? "a tool"}…`
        : event.step === "llm_completed"
          ? "Model responded."
          : "Model call failed.";
    case "subagent_progress":
      return event.subagentSummary ?? `${event.agent} is working…`;
    case "subagent_completed":
      return `${event.agent} finished: ${event.summary}`;
    case "orchestrator_completed":
      return event.summary;
    default:
      return "Working…";
  }
}
