import { useRef } from "react";
import type { RunState } from "@/lib/run";
import type { PipelineStage, PipelineAgent, StageState } from "@/features/build/PipelineStrip";

const STAGE_ORDER = ["prompt", "clarify", "design", "build", "sandbox", "preview"] as const;
type StageKey = (typeof STAGE_ORDER)[number];

const STAGE_LABEL: Record<StageKey, string> = {
  prompt: "prompt",
  clarify: "clarify",
  design: "design",
  build: "plan DAG · agents",
  sandbox: "sandbox",
  preview: "preview",
};

// Bootstrap() picks either a single generalist Agent loop or the full
// coder/tester/researcher/... DAG depending on request complexity — "main"
// is what lights up for the simple path, since the others never fire then.
const AGENT_NAMES = ["main", "coder", "debuggerr", "tester", "researcher", "uiExpert"] as const;

function currentActiveStage(status: RunState["status"]): StageKey | null {
  switch (status) {
    case "clarification_needed":
      return "clarify";
    case "select_design":
      return "design";
    case "running":
      return "build";
    default:
      return null;
  }
}

// Derives the pipeline visualization entirely from real signals: a ref
// tracks which statuses this run has actually passed through (reset when
// the runId changes), so a stage only ever reads "done" if it was genuinely
// visited — not fabricated from where the run currently happens to be.
export function useWorkspacePipeline(state: RunState): { stages: PipelineStage[]; agents: PipelineAgent[] } {
  const visitedRef = useRef<Set<RunState["status"]>>(new Set());
  const runIdRef = useRef<string | null>(null);

  const runId = "runId" in state ? state.runId : null;
  if (runId !== runIdRef.current) {
    runIdRef.current = runId;
    visitedRef.current = new Set();
  }
  visitedRef.current.add(state.status);

  const isCompleted = state.status === "completed";
  const isFailed = state.status === "failed";
  const activeStage = currentActiveStage(state.status);

  // A stage counts as "done" only if this run's status set actually proves
  // it happened — not inferred from where the run currently is.
  const reached: Record<StageKey, boolean> = {
    prompt: true,
    clarify: visitedRef.current.has("clarification_needed"),
    design: visitedRef.current.has("select_design"),
    build: visitedRef.current.has("running"),
    sandbox: isCompleted,
    preview: isCompleted,
  };

  // On failure, the failure point is the most-advanced stage this run
  // actually reached without finishing — everything after it never happened.
  // `reached.prompt` is always true, so this always finds a stage.
  const failStage: StageKey | null = isFailed
    ? ([...STAGE_ORDER].reverse().find((key) => reached[key]) as StageKey)
    : null;

  const stages: PipelineStage[] = STAGE_ORDER.map((key) => {
    let stageState: StageState;
    if (isCompleted) {
      stageState = "done";
    } else if (isFailed) {
      stageState = key === failStage ? "failed" : reached[key] ? "done" : "pending";
    } else if (key === activeStage) {
      stageState = "active";
    } else {
      stageState = reached[key] ? "done" : "pending";
    }
    return { key, label: STAGE_LABEL[key], state: stageState };
  });

  const seenAgents = new Set<string>();
  if (state.status === "running") {
    for (const event of state.feed) {
      if (event.type === "subagent_progress" || event.type === "subagent_completed") {
        seenAgents.add(event.agent);
      } else if (
        event.type === "agent_progress" ||
        event.type === "agent_tool_call" ||
        event.type === "agent_success"
      ) {
        seenAgents.add("main");
      }
    }
  }
  const agents: PipelineAgent[] = AGENT_NAMES.map((name) => ({ name, active: seenAgents.has(name) }));

  return { stages, agents };
}
