import { useEffect, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowUp, ChevronDown, Home, Plus, Square } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useRun } from "@/lib/run";
import { StatusLine, StatusItem, StatusSep } from "@/features/shell/StatusLine";
import { BrandMark } from "@/features/shell/BrandMark";
import { PipelineStrip } from "@/features/build/PipelineStrip";
import { useWorkspacePipeline } from "@/features/build/useWorkspacePipeline";
import { ClarifyingQuestions } from "@/features/build/ClarifyingQuestions";
import { DesignVariantPicker } from "@/features/build/DesignVariantPicker";
import { CodeViewer } from "@/features/build/CodeViewer";

const MODES = ["Build", "Plan"];

function WorkspaceInput() {
  const { state, submit } = useRun();
  const [mode, setMode] = useState(MODES[0]);
  const [text, setText] = useState("");

  const busy = state.status === "running" || state.status === "submitting";
  const canFollowUp = state.status === "completed" || state.status === "failed";
  const disabled = !canFollowUp;

  const handleSend = () => {
    if (!text.trim() || !canFollowUp) return;
    const projectId = state.status === "completed" || state.status === "failed" ? state.projectId : undefined;
    void submit(text.trim(), projectId);
    setText("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border bg-surface px-6 py-4">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border-hover bg-background p-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={busy ? "Building… you can queue a follow-up once this finishes." : "Queue follow-up…"}
          rows={1}
          className="px-2 py-1"
        />
        <div className="flex items-center justify-between pt-1">
          <button className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
            <Plus className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:text-foreground">
                {mode}
                <ChevronDown className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {MODES.map((m) => (
                  <DropdownMenuItem key={m} onSelect={() => setMode(m)}>
                    {m}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {busy ? (
              <button
                title="Stopping a run isn't wired up yet"
                disabled
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-hover text-muted opacity-50"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!text.trim() || disabled}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-accent text-accent-foreground transition-opacity disabled:opacity-40"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatLog({ wide }: { wide: boolean }) {
  const { state, messages, submitAnswers, selectDesign } = useRun();

  return (
    <div className={cn("mx-auto flex flex-1 flex-col gap-3.5 overflow-y-auto px-6 py-6", wide ? "max-w-3xl" : "")}>
      {messages.map((m) =>
        m.role === "user" ? (
          <div
            key={m.id}
            className="self-end whitespace-pre-wrap rounded-2xl rounded-br-sm border border-border-hover bg-surface px-4 py-2.5 text-sm"
          >
            {m.content}
          </div>
        ) : (
          <p key={m.id} className="flex gap-2.5 text-sm leading-relaxed text-muted">
            <span className="shrink-0 pt-0.5 font-mono text-[11px] text-ok">sys</span>
            <span className="whitespace-pre-wrap">{m.content}</span>
          </p>
        ),
      )}

      {(state.status === "running" || state.status === "submitting") && (
        <div className="flex items-center gap-2 pl-[30px] font-mono text-xs text-muted">
          <span className="relative flex h-2 w-2">
            <span className="status-dot absolute inline-flex h-full w-full rounded-full bg-accent" />
          </span>
          Building…
        </div>
      )}

      {state.status === "clarification_needed" && (
        <ClarifyingQuestions questions={state.questions} submitting={false} onSubmit={submitAnswers} />
      )}
      {state.status === "select_design" && (
        <DesignVariantPicker designs={state.designs} submitting={false} onSelect={selectDesign} />
      )}
    </div>
  );
}

function PreviewPane() {
  const { state } = useRun();
  if (state.status !== "completed") return null;

  return (
    <Tabs defaultValue="preview" className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <TabsList>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="code">Code</TabsTrigger>
        </TabsList>
        <span className="font-mono text-[11px] text-muted-foreground">reads from R2</span>
      </div>
      <TabsContent value="preview" className="flex-1">
        <iframe title="Live preview" src={state.result.previewUrl} className="h-full w-full bg-white" />
      </TabsContent>
      <TabsContent value="code" className="flex-1 overflow-hidden">
        <CodeViewer projectId={state.projectId} />
      </TabsContent>
    </Tabs>
  );
}

type ResumeStatus = "checking" | "not_found";

// Placeholder title until projects get real LLM-generated names — first 10
// characters of the prompt that started this run. Read from the message log
// rather than RunState directly — the completed/failed variants don't carry
// userPrompt, but the first user message is always there regardless of status.
function projectTitle(userPrompt: string | undefined): string {
  const trimmed = userPrompt?.trim();
  if (!trimmed) return "Untitled project";
  return trimmed.length > 10 ? `${trimmed.slice(0, 10)}…` : trimmed;
}

export function Workspace() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { state, messages, resume, reset } = useRun();
  const [resumeStatus, setResumeStatus] = useState<ResumeStatus | null>(null);
  const { stages, agents } = useWorkspacePipeline(state);

  const isLive = "runId" in state && state.runId === runId;
  const showSplit = state.status === "completed";

  useEffect(() => {
    if (isLive || !runId) return;
    setResumeStatus("checking");
    let cancelled = false;
    void resume(runId).then((ok) => {
      if (!cancelled) setResumeStatus(ok ? null : "not_found");
    });
    return () => {
      cancelled = true;
    };
    // Only re-attempt when the route's runId changes, not on every state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  if (!isLive) {
    if (resumeStatus === "checking" || resumeStatus === null) {
      return (
        <div className="flex h-full items-center justify-center gap-2.5 font-mono text-sm text-muted">
          <BrandMark className="h-6 w-6" />
          Reconnecting to this build…
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <p className="text-muted">This build session couldn&rsquo;t be found.</p>
        <Link to="/" className="text-accent hover:underline">
          Start a new build
        </Link>
      </div>
    );
  }

  const isFailed = state.status === "failed";

  return (
    <div className="flex h-full flex-col">
      <StatusLine>
        <StatusItem label="run" value={state.runId.slice(0, 8)} />
        <StatusSep />
        <StatusItem
          label="status"
          live={!isFailed && state.status !== "completed"}
          value={
            <span className={cn(isFailed && "text-danger", state.status === "completed" && "text-ok")}>
              {state.status.replace(/_/g, " ")}
            </span>
          }
        />
      </StatusLine>

      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className={cn("h-2 w-2 rounded-sm", isFailed ? "bg-danger" : state.status === "completed" ? "bg-ok" : "bg-accent")} />
          {projectTitle(messages.find((m) => m.role === "user")?.content)}
        </div>
        <div className="flex items-center gap-1">
          <button
            title="New chat"
            onClick={() => {
              reset();
              navigate("/");
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
          <Link
            to="/"
            title="Back to dashboard — the build keeps running in the background"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <Home className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <PipelineStrip stages={stages} agents={agents} />

      <div className={cn("flex flex-1 overflow-hidden", showSplit && "divide-x divide-border")}>
        <div className={cn("flex flex-col", showSplit ? "w-[400px] shrink-0" : "flex-1")}>
          <ChatLog wide={!showSplit} />
          <WorkspaceInput />
        </div>

        {showSplit && (
          <div className="flex-1">
            <PreviewPane />
          </div>
        )}
      </div>
    </div>
  );
}
