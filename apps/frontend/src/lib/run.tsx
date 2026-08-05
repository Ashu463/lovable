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
import { gql, GqlError } from "@/lib/graphql";
import { subscribe } from "@/lib/gqlStream";
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

const CREATE_RUN = `
  mutation CreateRun($projectId: ID, $userPrompt: String!) {
    createRun(projectId: $projectId, userPrompt: $userPrompt) { id projectId }
  }
`;

const CONTINUE_RUN = `
  mutation ContinueRun($projectId: ID!, $runId: ID!, $answers: [AgentAnswerInput!]!, $selectedDesignId: ID) {
    continueRun(projectId: $projectId, runId: $runId, answers: $answers, selectedDesignId: $selectedDesignId) {
      id
      projectId
    }
  }
`;

const RUN_STATE = `
  query RunState($runId: ID!) {
    runState(runId: $runId) {
      runId
      projectId
      userPrompt
      status
      pauseEvent
      completedEvent
      failedEvent
    }
  }
`;

const RUN_EVENTS = `
  subscription RunEvents($runId: ID!) {
    runEvents(runId: $runId)
  }
`;

interface RunRef {
  id: string;
  projectId: string;
}

interface RunContextValue {
  state: RunState;
  messages: ChatMessage[];
  submit: (userPrompt: string, projectId?: string) => Promise<string | null>;
  submitAnswers: (answers: Answers[]) => Promise<string | null>;
  selectDesign: (designId: string) => Promise<string | null>;
  resume: (runId: string) => Promise<boolean>;
  reset: () => void;
}

interface RunStateResponse {
  runState: {
    runId: string;
    projectId: string;
    userPrompt: string;
    status: "IN_PROGRESS" | "CLARIFICATION_NEEDED" | "AWAITING_DESIGN_SELECTION" | "COMPLETED" | "FAILED" | "STOPPED";
    pauseEvent: { type: "clarification_needed"; questions: Question[] } | { type: "select_design"; designs: DesignOption[] } | null;
    completedEvent: { type: "run_completed"; result: CompletedResult } | null;
    failedEvent: { type: "run_failed"; error: string } | null;
  };
}

const RunContext = createContext<RunContextValue | null>(null);

function messageFor(err: unknown, fallback: string): string {
  return err instanceof GqlError ? err.message : fallback;
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

      closeStreamRef.current = subscribe<{ runEvents: OrchestratorEvent }>(
        RUN_EVENTS,
        { runId },
        {
          onEvent: ({ runEvents: event }) => {
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
        },
      );
    },
    [pushMessage],
  );

  const submit = useCallback(
    async (userPrompt: string, projectId?: string) => {
      pushMessage("user", userPrompt);
      setState({ status: "submitting" });
      try {
        const res = await gql<{ createRun: RunRef }>(CREATE_RUN, {
          projectId: projectId ?? null,
          userPrompt,
        });
        attachStream(res.createRun.id, res.createRun.projectId, userPrompt);
        return res.createRun.id;
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
        // Continues the same pending runId — no new run is created here.
        const res = await gql<{ continueRun: RunRef }>(CONTINUE_RUN, {
          projectId,
          runId,
          answers,
          selectedDesignId: null,
        });
        attachStream(res.continueRun.id, res.continueRun.projectId, userPrompt);
        return res.continueRun.id;
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
      const { runId, projectId, userPrompt } = state;
      pushMessage("user", "Picked a design direction.");
      setState({ status: "submitting" });
      try {
        const res = await gql<{ continueRun: RunRef }>(CONTINUE_RUN, {
          projectId,
          runId,
          answers: [],
          selectedDesignId: designId,
        });
        attachStream(res.continueRun.id, res.continueRun.projectId, userPrompt);
        return res.continueRun.id;
      } catch (err) {
        const error = messageFor(err, "Failed to continue the build.");
        pushMessage("system", `Failed: ${error}`);
        setState({ status: "failed", runId, projectId, error });
        return null;
      }
    },
    [state, attachStream, pushMessage],
  );

  // Reconstructs state for /w/:runId after a refresh — RunProvider state
  // otherwise only lives in memory for the tab that started the build.
  const resume = useCallback(
    async (runId: string) => {
      try {
        const res = await gql<RunStateResponse>(RUN_STATE, { runId });
        const { projectId, userPrompt, status, pauseEvent, completedEvent, failedEvent } = res.runState;

        if (status === "IN_PROGRESS") {
          attachStream(runId, projectId, userPrompt);
          return true;
        }
        if (status === "CLARIFICATION_NEEDED" && pauseEvent?.type === "clarification_needed") {
          setState({ status: "clarification_needed", runId, projectId, userPrompt, questions: pauseEvent.questions });
          return true;
        }
        if (status === "AWAITING_DESIGN_SELECTION" && pauseEvent?.type === "select_design") {
          setState({ status: "select_design", runId, projectId, userPrompt, designs: pauseEvent.designs });
          return true;
        }
        if (status === "COMPLETED" && completedEvent?.type === "run_completed") {
          setState({ status: "completed", runId, projectId, result: completedEvent.result });
          return true;
        }
        if (status === "FAILED") {
          setState({ status: "failed", runId, projectId, error: failedEvent?.error ?? "This run failed." });
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [attachStream],
  );

  const reset = useCallback(() => {
    closeStreamRef.current?.();
    setState({ status: "idle" });
    setMessages([]);
  }, []);

  const value = useMemo(
    () => ({ state, messages, submit, submitAnswers, selectDesign, resume, reset }),
    [state, messages, submit, submitAnswers, selectDesign, resume, reset],
  );

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}

export function useRun() {
  const ctx = useContext(RunContext);
  if (!ctx) throw new Error("useRun must be used within RunProvider");
  return ctx;
}
