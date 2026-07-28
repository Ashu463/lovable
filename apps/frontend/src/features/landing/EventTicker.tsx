const EVENTS = [
  ["coder", "writeFile src/App.tsx"],
  ["orchestrator", "tool_call: planTasks (7 nodes)"],
  ["sandbox", "ready in 1.24s"],
  ["tester", "vitest: 12 passed"],
  ["researcher", "3 sources indexed"],
  ["debuggerr", "patched type error in useStreak.ts"],
  ["run", "preview published to R2"],
] as const;

// Curated, not live — an ambient illustration of the kind of events the
// orchestrator actually emits (see packages/agents/agent/events.ts), not a
// claim about any specific run. The workspace's own pipeline shows real state.
export function EventTicker() {
  const items = [...EVENTS, ...EVENTS];
  return (
    <div className="overflow-hidden border-b border-border bg-background py-2.5">
      <div className="ticker-track flex w-max gap-11 whitespace-nowrap font-mono text-xs text-muted">
        {items.map(([who, what], i) => (
          <span key={i}>
            <b className="font-medium text-accent">{who}</b> → <i className="text-muted-foreground not-italic">{what}</i>
          </span>
        ))}
      </div>
    </div>
  );
}
