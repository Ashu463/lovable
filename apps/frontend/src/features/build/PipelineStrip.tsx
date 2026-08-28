import { cn } from "@/lib/utils";
import { agentLabel } from "@/features/build/agentLabels";

export type StageState = "done" | "active" | "failed" | "pending";

export interface PipelineStage {
  key: string;
  label: string;
  state: StageState;
}

export interface PipelineAgent {
  name: string;
  active: boolean;
}

// Shared visual for the build pipeline — used verbatim by the landing page
// (illustrative, fixed) and the workspace (driven by the real run state).
export function PipelineStrip({ stages, agents }: { stages: PipelineStage[]; agents?: PipelineAgent[] }) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto border-y border-border bg-surface px-6 py-3.5">
      {stages.map((stage, i) => (
        <div key={stage.key} className="flex shrink-0 items-center">
          <div
            className={cn(
              "flex items-center gap-2 font-mono text-[11.5px] whitespace-nowrap",
              stage.state === "done" && "text-muted",
              stage.state === "active" && "text-foreground",
              stage.state === "failed" && "text-danger",
              stage.state === "pending" && "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rotate-45 border",
                stage.state === "done" && "border-ok bg-ok",
                stage.state === "active" && "border-accent bg-accent shadow-[0_0_10px_var(--color-accent)]",
                stage.state === "failed" && "border-danger bg-danger",
                stage.state === "pending" && "border-muted-foreground bg-transparent",
              )}
            />
            {stage.label}
          </div>

          {agents && stage.key === "build" && (
            <div className="flex gap-1.5 px-3">
              {agents.map((a) => (
                <span
                  key={a.name}
                  className={cn(
                    "rounded-md border px-2 py-0.5 font-mono text-[11px]",
                    a.active ? "border-accent text-foreground" : "border-border text-muted",
                  )}
                >
                  {agentLabel(a.name)}
                </span>
              ))}
            </div>
          )}

          {i < stages.length - 1 && (
            <span
              className={cn(
                "mx-3 h-px w-7 shrink-0",
                stage.state === "done" ? "bg-ok" : "bg-border-hover",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
