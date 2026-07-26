import { useState, type KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowUp, ChevronDown, Minimize2, Plus, Sparkles, Square } from "lucide-react";
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
    <div className="border-t border-border bg-background px-6 py-4">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-surface/80 p-3">
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
              <DropdownMenuTrigger className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground">
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

function ChatLog() {
  const { state, messages, submitAnswers, selectDesign } = useRun();

  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col gap-4 overflow-y-auto px-6 py-8">
      {messages.map((m) =>
        m.role === "user" ? (
          <div
            key={m.id}
            className="self-end whitespace-pre-wrap rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm"
          >
            {m.content}
          </div>
        ) : (
          <p key={m.id} className="whitespace-pre-wrap text-sm text-muted">
            {m.content}
          </p>
        ),
      )}

      {(state.status === "running" || state.status === "submitting") && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
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
      <div className="flex items-center border-b border-border px-4 py-2">
        <TabsList>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="code">Code</TabsTrigger>
        </TabsList>
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

export function Workspace() {
  const { runId } = useParams<{ runId: string }>();
  const { state } = useRun();

  const isLive = "runId" in state && state.runId === runId;
  const showSplit = state.status === "completed";

  if (!isLive) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
        <p className="text-muted">
          This build session isn&rsquo;t active in this tab anymore — state lives in
          memory for this demo, so a refresh loses it.
        </p>
        <Link to="/" className="text-accent hover:underline">
          Start a new build
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <button className="flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground">
          <Sparkles className="h-4 w-4 text-accent" />
          Untitled project
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <Link to="/" title="Back to home" className="text-muted hover:text-foreground">
          <Minimize2 className="h-4 w-4" />
        </Link>
      </header>

      <div className={cn("flex flex-1 overflow-hidden", showSplit && "divide-x divide-border")}>
        <div className={cn("flex flex-col", showSplit ? "w-[420px] shrink-0" : "flex-1")}>
          <ChatLog />
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
