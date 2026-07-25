import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { openEventStream } from "@/lib/sse";
import type { OrchestratorEvent } from "../../../../packages/agents/agent/events";
import type { Answers, DesignOption, OrchestratorResponse } from "../../../../packages/agents/types/agentTypes";
import type { Question } from "../../../../packages/agents/baml_client/types";

type CompletedResult = Extract<OrchestratorResponse, { status: "completed" }>;

export type RunState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "running"; runId: string; projectId: string; userPrompt: string; feed: OrchestratorEvent[] }
  | { status: "clarification_needed"; runId: string; projectId: string; userPrompt: string; questions: Question[] }
  | { status: "select_design"; runId: string; projectId: string; userPrompt: string; designs: DesignOption[] }
  | { status: "completed"; runId: string; projectId: string; result: CompletedResult }
  | { status: "failed"; runId: string; projectId: string; error: string };

interface CreateRunResponse {
  success: boolean;
  runId: string;
  projectId: string;
}

function messageFor(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function useRun() {
  const [state, setState] = useState<RunState>({ status: "idle" });
  const closeStreamRef = useRef<(() => void) | null>(null);

  useEffect(() => () => closeStreamRef.current?.(), []);

  const attachStream = useCallback(
    (runId: string, projectId: string, userPrompt: string) => {
      closeStreamRef.current?.();
      setState({ status: "running", runId, projectId, userPrompt, feed: [] });

      closeStreamRef.current = openEventStream(`/api/chat/${runId}/stream`, {
        onMessage: (raw) => {
          let event: OrchestratorEvent;
          try {
            event = JSON.parse(raw);
          } catch {
            return;
          }

          switch (event.type) {
            case "clarification_needed":
              setState({ status: "clarification_needed", runId, projectId, userPrompt, questions: event.questions });
              return;
            case "select_design":
              // The orchestrator has already returned for this run — nothing
              // more will arrive on this connection until a new run picks up.
              closeStreamRef.current?.();
              setState({ status: "select_design", runId, projectId, userPrompt, designs: event.designs });
              return;
            case "run_completed":
              setState({ status: "completed", runId, projectId, result: event.result as CompletedResult });
              return;
            case "run_failed":
              setState({ status: "failed", runId, projectId, error: event.error });
              return;
            default:
              setState((prev) =>
                prev.status === "running" ? { ...prev, feed: [...prev.feed, event] } : prev,
              );
          }
        },
        onError: () => {
          setState({ status: "failed", runId, projectId, error: "Lost connection to the build stream." });
        },
      });
    },
    [],
  );

  const submit = useCallback(
    async (userPrompt: string, projectId?: string) => {
      setState({ status: "submitting" });
      try {
        const res = await api.post<CreateRunResponse>(
          projectId ? `/api/chat/${projectId}` : "/api/chat",
          { userPrompt },
        );
        attachStream(res.runId, res.projectId, userPrompt);
      } catch (err) {
        setState({
          status: "failed",
          runId: "",
          projectId: projectId ?? "",
          error: messageFor(err, "Failed to start the build."),
        });
      }
    },
    [attachStream],
  );

  const submitAnswers = useCallback(
    async (answers: Answers[]) => {
      if (state.status !== "clarification_needed") return;
      const { runId, projectId, userPrompt } = state;
      setState({ status: "submitting" });
      try {
        const res = await api.post<CreateRunResponse>(`/api/chat/${projectId}/clarifications`, {
          previousRunId: runId,
          answers,
        });
        attachStream(res.runId, res.projectId, userPrompt);
      } catch (err) {
        setState({ status: "failed", runId, projectId, error: messageFor(err, "Failed to resume the build.") });
      }
    },
    [state, attachStream],
  );

  const selectDesign = useCallback(
    async (designId: string) => {
      if (state.status !== "select_design") return;
      const { projectId, userPrompt } = state;
      setState({ status: "submitting" });
      try {
        // selectedDesignId travels with the new run request — the orchestrator
        // marks it selected server-side, no separate PATCH round trip needed.
        const res = await api.post<CreateRunResponse>(`/api/chat/${projectId}`, {
          userPrompt,
          selectedDesignId: designId,
        });
        attachStream(res.runId, res.projectId, userPrompt);
      } catch (err) {
        setState({ status: "failed", runId: "", projectId, error: messageFor(err, "Failed to continue the build.") });
      }
    },
    [state, attachStream],
  );

  const reset = useCallback(() => {
    closeStreamRef.current?.();
    setState({ status: "idle" });
  }, []);

  return { state, submit, submitAnswers, selectDesign, reset };
}
