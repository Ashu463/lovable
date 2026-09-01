import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent } from "react";
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
import { useRun, type ChatMessage } from "@/lib/run";
import { Markdown } from "@/features/build/Markdown";
import { StatusLine, StatusItem, StatusSep } from "@/features/shell/StatusLine";
import { BrandMark } from "@/features/shell/BrandMark";
import { PipelineStrip } from "@/features/build/PipelineStrip";
import { DagView } from "@/features/build/DagView";
import { useWorkspacePipeline } from "@/features/build/useWorkspacePipeline";
import { ClarifyingQuestions } from "@/features/build/ClarifyingQuestions";
import { DesignVariantPicker } from "@/features/build/DesignVariantPicker";
import { UIPreferenceQuestions } from "@/features/build/UIPreferenceQuestions";
// CodeMirror + its language packages are the single biggest chunk in this
// app — only worth loading once someone actually opens the code tab.
const CodeViewer = lazy(() => import("@/features/build/CodeViewer").then((m) => ({ default: m.CodeViewer })));

const MODES = ["Build", "Plan"];

function WorkspaceInput() {
  const { state, submit } = useRun();
  const navigate = useNavigate();
  const [mode, setMode] = useState(MODES[0]);
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const busy = state.status === "running" || state.status === "submitting";
  const canFollowUp = state.status === "completed" || state.status === "failed" || state.status === "conversation";
  const disabled = !canFollowUp;

  // Grow with the content up to a cap, then scroll — height has to be reset to
  // auto first or scrollHeight keeps reporting the previous, taller box.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const handleSend = () => {
    if (!text.trim() || !canFollowUp) return;
    const projectId =
      state.status === "completed" || state.status === "failed" || state.status === "conversation"
        ? state.projectId
        : undefined;
    const prompt = text.trim();
    setText("");
    // submit() starts a new run under the same project; the route still points
    // at the previous run, so the page's isLive check would desync and fall
    // back into the resume flow the moment this run's state attaches.
    void submit(prompt, projectId).then((newRunId) => {
      if (newRunId) navigate(`/w/${newRunId}`);
    });
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
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={busy ? "Building… you can queue a follow-up once this finishes." : "Queue follow-up…"}
          rows={1}
          className="max-h-[200px] overflow-y-auto px-2 py-1 leading-relaxed"
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

// Consecutive progress events collapse into one scrolling block so a long build
// can't push the conversation off screen.
type ChatGroup =
  | { kind: "message"; message: ChatMessage }
  | { kind: "activity"; id: string; messages: ChatMessage[] };

function groupMessages(messages: ChatMessage[]): ChatGroup[] {
  const groups: ChatGroup[] = [];
  for (const message of messages) {
    if (message.role === "system" && message.kind === "progress") {
      const last = groups.at(-1);
      if (last?.kind === "activity") {
        last.messages.push(message);
        continue;
      }
      groups.push({ kind: "activity", id: message.id, messages: [message] });
      continue;
    }
    groups.push({ kind: "message", message });
  }
  return groups;
}

function ActivityFeed({ messages, live }: { messages: ChatMessage[]; live: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pin to the newest line as events stream in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <div className="rounded-xl border border-border bg-surface/40">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 font-mono text-[11px] text-muted">
        {live ? (
          <span className="relative flex h-1.5 w-1.5">
            <span className="status-dot absolute inline-flex h-full w-full rounded-full bg-accent" />
          </span>
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-ok" />
        )}
        activity
        <span className="ml-auto tabular-nums">{messages.length}</span>
      </div>
      <div ref={scrollRef} className="max-h-40 overflow-y-auto px-3 py-2">
        {messages.map((m) => (
          <p key={m.id} className="truncate font-mono text-xs leading-6 text-muted" title={m.content}>
            {m.content}
          </p>
        ))}
      </div>
    </div>
  );
}

function ChatLog({ wide, extraWide }: { wide: boolean; extraWide?: boolean }) {
  const { state, messages, awaitingDesigns, submitAnswers, selectDesign, submitUIPreferences } = useRun();
  const busy = state.status === "running" || state.status === "submitting";
  const groups = groupMessages(messages);

  // Design selection needs room to actually show the designs — the normal
  // chat-width cap (max-w-3xl) is what made the picker read as a tiny box.
  return (
    <div className={cn("mx-auto flex w-full flex-1 flex-col gap-3.5 overflow-y-auto px-6 py-6", extraWide ? "max-w-6xl" : wide ? "max-w-3xl" : "")}>
      {groups.map((group, i) =>
        group.kind === "activity" ? (
          <ActivityFeed
            key={group.id}
            messages={group.messages}
            live={busy && i === groups.length - 1}
          />
        ) : group.message.role === "user" ? (
          <div
            key={group.message.id}
            className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-sm border border-border-hover bg-surface px-4 py-2.5 text-sm"
          >
            {group.message.content}
          </div>
        ) : (
          <Markdown
            key={group.message.id}
            content={group.message.content}
            className="text-sm leading-relaxed text-muted"
          />
        ),
      )}

      {awaitingDesigns && state.status !== "select_design" && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface/40 px-4 py-3">
          <span className="relative mt-1 flex h-2 w-2 shrink-0">
            <span className="status-dot absolute inline-flex h-full w-full rounded-full bg-accent" />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-foreground">Generating three design directions…</span>
            <span className="text-xs text-muted">
              This takes about a minute. You&rsquo;ll pick one before the build starts.
            </span>
          </div>
        </div>
      )}

      {busy && !awaitingDesigns && (
        <div className="flex items-center gap-2 font-mono text-xs text-muted">
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
      {state.status === "ui_preference_needed" && (
        <UIPreferenceQuestions questions={state.questions} submitting={false} onSubmit={submitUIPreferences} />
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
        {state.result.previewUrl ? (
          <iframe title="Live preview" src={state.result.previewUrl} className="h-full w-full bg-white" />
        ) : (
          <div className="flex h-full items-center justify-center gap-2.5 font-mono text-sm text-muted">
            <BrandMark className="h-5 w-5" />
            Starting sandbox…
          </div>
        )}
      </TabsContent>
      <TabsContent value="code" className="flex-1 overflow-hidden">
        <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading editor…</div>}>
          <CodeViewer projectId={state.projectId} />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}

type ResumeStatus = "checking" | "not_found";

// The agent names a project once, when its first run finishes. Until that
// lands the project is genuinely unnamed, so it shows as "New project" rather
// than a title that would change on the next follow-up.
function projectTitle(projectName: string | null): string {
  const trimmed = projectName?.trim();
  if (!trimmed) return "New project";
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed;
}

export function Workspace() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { state, projectName, resume, reset } = useRun();
  const [resumeStatus, setResumeStatus] = useState<ResumeStatus | null>(null);
  const { stages, agents } = useWorkspacePipeline(state);

  const isLive = "runId" in state && state.runId === runId;
  // Guarded on isLive so a previous run's completed state can't flash its
  // preview while a different runId is still resuming.
  const showSplit = isLive && state.status === "completed";

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

  // The chrome renders immediately from the URL alone; only the panes that need
  // server data wait. Blocking the whole page on resume made every reload look
  // like a cold start.
  const resuming = !isLive && resumeStatus !== "not_found";
  const notFound = !isLive && resumeStatus === "not_found";

  const isFailed = state.status === "failed";
  // A conversational reply is terminal, same as "completed" — just without a
  // build behind it, so it gets the same non-live/ok styling.
  const isDone = state.status === "completed" || state.status === "conversation";

  return (
    <div className="flex h-full flex-col">
      <StatusLine>
        <StatusItem label="run" value={(isLive ? state.runId : (runId ?? "")).slice(0, 8)} />
        <StatusSep />
        <StatusItem
          label="status"
          live={resuming || (!isFailed && !isDone)}
          value={
            <span className={cn(isFailed && "text-danger", isDone && "text-ok")}>
              {resuming ? "loading" : notFound ? "not found" : state.status.replace(/_/g, " ")}
            </span>
          }
        />
      </StatusLine>

      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className={cn("h-2 w-2 rounded-sm", resuming ? "bg-muted" : isFailed ? "bg-danger" : isDone ? "bg-ok" : "bg-accent")} />
          {resuming ? (
            <span className="h-4 w-48 animate-pulse rounded bg-surface-hover" />
          ) : (
            <span className="truncate" title={isLive && "userPrompt" in state ? state.userPrompt : undefined}>
              {notFound ? "Session not found" : projectTitle(projectName)}
            </span>
          )}
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

      {state.status === "running" && (
        <div className="px-4 py-3">
          <DagView projectId={state.projectId} runId={state.runId} feed={state.feed} />
        </div>
      )}

      {resuming ? (
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3.5 px-6 py-6">
          <div className="h-10 w-2/3 animate-pulse self-end rounded-2xl bg-surface" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-surface" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-surface" />
          <div className="flex items-center gap-2 pt-1 font-mono text-xs text-muted">
            <BrandMark className="h-4 w-4" />
            Loading this build…
          </div>
        </div>
      ) : notFound ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-muted">This build session couldn&rsquo;t be found.</p>
          <Link to="/" className="text-accent hover:underline">
            Start a new build
          </Link>
        </div>
      ) : (
        <div className={cn("flex flex-1 overflow-hidden", showSplit && "divide-x divide-border")}>
          <div className={cn("flex flex-col", showSplit ? "w-[400px] shrink-0" : "flex-1")}>
            <ChatLog wide={!showSplit} extraWide={!showSplit && state.status === "select_design"} />
            <WorkspaceInput />
          </div>

          {showSplit && (
            <div className="flex-1">
              <PreviewPane />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
