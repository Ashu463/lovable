// To-scale drawing of the real request path: user prompt through the
// orchestrator, the clarify/design gate, the agent DAG, the sandbox, and the
// two out-of-band systems (Redis/SSE and R2) that make it observable and
// durable. Every node names an actual service, not a marketing abstraction.
export function BlueprintSchematic() {
  return (
    <div className="grid-panel relative mx-6 my-8 h-[300px] overflow-hidden rounded-2xl border border-border sm:mx-10 sm:h-[340px]">
      <svg viewBox="0 0 1080 340" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="wire-gradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--color-accent-from)" />
            <stop offset="1" stopColor="var(--color-accent-to)" />
          </linearGradient>
          <marker id="arrow" markerWidth="9" markerHeight="9" refX="6" refY="4.5" orient="auto">
            <path d="M0,0 L9,4.5 L0,9 Z" fill="var(--color-accent)" />
          </marker>
        </defs>
        <path d="M120,70 H300" stroke="url(#wire-gradient)" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />
        <path d="M430,70 H560" stroke="url(#wire-gradient)" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />
        <path d="M560,110 V180 H470" stroke="url(#wire-gradient)" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />
        <path d="M340,210 H210 V255" stroke="url(#wire-gradient)" strokeWidth="2" fill="none" markerEnd="url(#arrow)" />
        <path
          d="M630,70 H980"
          stroke="var(--color-border-hover)"
          strokeWidth="1.4"
          fill="none"
          markerEnd="url(#arrow)"
        />
        <path
          d="M180,290 H840 V270"
          stroke="var(--color-border-hover)"
          strokeWidth="1.4"
          fill="none"
          markerEnd="url(#arrow)"
        />
      </svg>

      <Node x={60} y={70} label="01 · input" name="user prompt" crit />
      <Node x={365} y={70} label="02 · brain" name="orchestrator" crit />
      <Node x={600} y={70} label="03 · gate" name="clarify + design" crit />
      <StackNode x={400} y={180} label="04 · DAG of agents" />
      <Node x={210} y={270} label="05 · runtime" name="E2B sandbox" crit />
      <Node x={900} y={270} label="store" name="R2 · files" />
      <Node x={1010} y={70} label="stream" name="SSE · Redis" />

      <Callout x={700} y={150} lead="event bus →">
        every agent action publishes to Redis, fanned out to the browser over SSE, live.
      </Callout>
      <Callout x={560} y={300} lead="durable →">
        the Code tab reads finished files from R2, never the ephemeral sandbox.
      </Callout>
    </div>
  );
}

function Node({ x, y, label, name, crit }: { x: number; y: number; label: string; name: string; crit?: boolean }) {
  return (
    <div
      className={
        "absolute min-w-[104px] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-surface/95 px-3.5 py-2.5 text-center text-xs " +
        (crit ? "border-accent shadow-[0_0_20px_-6px_var(--color-accent)]" : "border-border-hover")
      }
      style={{ left: x, top: y }}
    >
      <span className="mb-1 block font-mono text-[9.5px] tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </span>
      {name}
    </div>
  );
}

function StackNode({ x, y, label }: { x: number; y: number; label: string }) {
  const chips = ["coder", "debuggerr", "tester", "researcher", "uiExpert"];
  return (
    <div
      className="absolute min-w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-accent bg-surface/95 p-2.5 text-center shadow-[0_0_20px_-6px_var(--color-accent)]"
      style={{ left: x, top: y }}
    >
      <span className="mb-1.5 block font-mono text-[9.5px] tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </span>
      <div className="flex flex-wrap justify-center gap-1.5">
        {chips.map((c) => (
          <span key={c} className="rounded border border-border-hover px-2 py-0.5 font-mono text-[10px] text-muted">
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

function Callout({ x, y, lead, children }: { x: number; y: number; lead: string; children: string }) {
  return (
    <div className="absolute max-w-[180px] font-mono text-[10.5px] leading-[1.55] text-muted-foreground" style={{ left: x, top: y }}>
      <b className="font-medium text-accent">{lead}</b> {children}
    </div>
  );
}
