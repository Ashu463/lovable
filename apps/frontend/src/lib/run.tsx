import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError } from "@/lib/api";
import { openEventStream } from "@/lib/sse";
import { describeEvent } from "@/features/build/describeEvent";
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

export interface ChatMessage {
  id: string;
  role: "user" | "system";
  content: string;
}

interface CreateRunResponse {
  success: boolean;
  runId: string;
  projectId: string;
}

interface RunContextValue {
  state: RunState;
  messages: ChatMessage[];
  submit: (userPrompt: string, projectId?: string) => Promise<string | null>;
  submitAnswers: (answers: Answers[]) => Promise<string | null>;
  selectDesign: (designId: string) => Promise<string | null>;
  reset: () => void;
}

const RunContext = createContext<RunContextValue | null>(null);

function messageFor(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

let messageSeq = 0;
function nextId(): string {
  messageSeq += 1;
  return `msg_${messageSeq}`;
}

export function RunProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RunState>({ status: "idle" });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const closeStreamRef = useRef<(() => void) | null>(null);

  useEffect(() => () => closeStreamRef.current?.(), []);

  const pushMessage = useCallback((role: ChatMessage["role"], content: string) => {
    setMessages((prev) => [...prev, { id: nextId(), role, content }]);
  }, []);

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
              pushMessage("system", "I need a couple of things clarified before continuing.");
              setState({ status: "clarification_needed", runId, projectId, userPrompt, questions: event.questions });
              return;
            case "select_design":
              // The orchestrator has already returned for this run — nothing
              // more will arrive on this connection until a new run picks up.
              closeStreamRef.current?.();
              pushMessage("system", "Here are a few design directions to start from.");
              setState({ status: "select_design", runId, projectId, userPrompt, designs: event.designs });
              return;
            case "run_completed": {
              const result = event.result as CompletedResult;
              pushMessage("system", result.summary);
              setState({ status: "completed", runId, projectId, result });
              return;
            }
            case "run_failed":
              pushMessage("system", `Failed: ${event.error}`);
              setState({ status: "failed", runId, projectId, error: event.error });
              return;
            default:
              pushMessage("system", describeEvent(event));
              setState((prev) =>
                prev.status === "running" ? { ...prev, feed: [...prev.feed, event] } : prev,
              );
          }
        },
        onError: () => {
          pushMessage("system", "Lost connection to the build stream.");
          setState({ status: "failed", runId, projectId, error: "Lost connection to the build stream." });
        },
      });
    },
    [pushMessage],
  );

  const submit = useCallback(
    async (userPrompt: string, projectId?: string) => {
      pushMessage("user", userPrompt);
      setState({ status: "submitting" });
      try {
        const res = await api.post<CreateRunResponse>(
          projectId ? `/api/chat/${projectId}` : "/api/chat",
          { userPrompt },
        );
        attachStream(res.runId, res.projectId, userPrompt);
        return res.runId;
      } catch (err) {
        const error = messageFor(err, "Failed to start the build.");
        pushMessage("system", `Failed: ${error}`);
        setState({ status: "failed", runId: "", projectId: projectId ?? "", error });
        return null;
      }
    },
    [attachStream, pushMessage],
  );

  const submitAnswers = useCallback(
    async (answers: Answers[]) => {
      if (state.status !== "clarification_needed") return null;
      const { runId, projectId, userPrompt } = state;
      pushMessage("user", answers.map((a) => `${a.question} → ${a.answer}`).join("\n"));
      setState({ status: "submitting" });
      try {
        const res = await api.post<CreateRunResponse>(`/api/chat/${projectId}/clarifications`, {
          previousRunId: runId,
          answers,
        });
        attachStream(res.runId, res.projectId, userPrompt);
        return res.runId;
      } catch (err) {
        const error = messageFor(err, "Failed to resume the build.");
        pushMessage("system", `Failed: ${error}`);
        setState({ status: "failed", runId, projectId, error });
        return null;
      }
    },
    [state, attachStream, pushMessage],
  );

  const selectDesign = useCallback(
    async (designId: string) => {
      if (state.status !== "select_design") return null;
      const { projectId, userPrompt } = state;
      pushMessage("user", "Picked a design direction.");
      setState({ status: "submitting" });
      try {
        // selectedDesignId travels with the new run request — the orchestrator
        // marks it selected server-side, no separate PATCH round trip needed.
        const res = await api.post<CreateRunResponse>(`/api/chat/${projectId}`, {
          userPrompt,
          selectedDesignId: designId,
        });
        attachStream(res.runId, res.projectId, userPrompt);
        return res.runId;
      } catch (err) {
        const error = messageFor(err, "Failed to continue the build.");
        pushMessage("system", `Failed: ${error}`);
        setState({ status: "failed", runId: "", projectId, error });
        return null;
      }
    },
    [state, attachStream, pushMessage],
  );

  const reset = useCallback(() => {
    closeStreamRef.current?.();
    setState({ status: "idle" });
    setMessages([]);
  }, []);

  const value = useMemo(
    () => ({ state, messages, submit, submitAnswers, selectDesign, reset }),
    [state, messages, submit, submitAnswers, selectDesign, reset],
  );

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}

export function useRun() {
  const ctx = useContext(RunContext);
  if (!ctx) throw new Error("useRun must be used within RunProvider");
  return ctx;
}
