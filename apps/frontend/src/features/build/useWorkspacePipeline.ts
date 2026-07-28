import { useRef } from "react";
import type { RunState } from "@/lib/run";
import type { PipelineStage, PipelineAgent } from "@/features/build/PipelineStrip";

const STAGES: { key: string; label: string }[] = [
  { key: "prompt", label: "prompt" },
  { key: "clarify", label: "clarify" },
  { key: "design", label: "design" },
  { key: "build", label: "plan DAG · agents" },
  { key: "sandbox", label: "sandbox" },
  { key: "preview", label: "preview" },
];

const AGENT_NAMES = ["coder", "debuggerr", "tester", "researcher", "uiExpert"] as const;

// There's no discrete "sandbox ready" event surfaced to the frontend today
// (see the architecture page's known gaps), so that stage only ever reads
// as done once the run completes — not fabricated in between.
function stageIndexFor(status: RunState["status"]): number {
  switch (status) {
    case "clarification_needed":
      return 1;
    case "select_design":
      return 2;
    case "running":
      return 3;
    case "completed":
      return 5;
    default:
      return 0;
  }
}

// Derives the pipeline visualization from the real RunState — no per-run
// history is persisted, so a ref tracks the furthest stage reached this run
// (reset when the runId changes) to keep earlier stages showing as "done"
// once the run has moved on, and to freeze at the failure point on error.
export function useWorkspacePipeline(state: RunState): { stages: PipelineStage[]; agents: PipelineAgent[] } {
  const maxSeenRef = useRef(0);
  const runIdRef = useRef<string | null>(null);

  const runId = "runId" in state ? state.runId : null;
  if (runId !== runIdRef.current) {
    runIdRef.current = runId;
    maxSeenRef.current = 0;
  }
  if (state.status !== "failed") {
    maxSeenRef.current = Math.max(maxSeenRef.current, stageIndexFor(state.status));
  }

  const current = stageIndexFor(state.status);
  const stages: PipelineStage[] = STAGES.map((s, i) => {
    if (state.status === "completed") return { ...s, state: "done" };
    if (state.status === "failed") {
      if (i < maxSeenRef.current) return { ...s, state: "done" };
      if (i === maxSeenRef.current) return { ...s, state: "failed" };
      return { ...s, state: "pending" };
    }
    if (i < current) return { ...s, state: "done" };
    if (i === current) return { ...s, state: "active" };
    return { ...s, state: "pending" };
  });

  const seenAgents = new Set<string>();
  if (state.status === "running") {
    for (const event of state.feed) {
      if (event.type === "subagent_progress" || event.type === "subagent_completed") {
        seenAgents.add(event.agent);
      }
    }
  }
  const agents: PipelineAgent[] = AGENT_NAMES.map((name) => ({ name, active: seenAgents.has(name) }));

  return { stages, agents };
}
