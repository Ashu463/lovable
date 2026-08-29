// Display names for the internal agent-type strings that show up in SSE
// events and planned todos — "coder"/"uiExpert" are implementation names,
// not something to show the user.
const AGENT_LABELS: Record<string, string> = {
  main: "Agent",
  coder: "Coder Agent",
  uiExpert: "Designer",
  tester: "Tester Agent",
  debuggerr: "Debugger",
  researcher: "Researcher",
};

export function agentLabel(name: string): string {
  return AGENT_LABELS[name] ?? name;
}
