import { useState, type KeyboardEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUp, ChevronDown, Plus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { useRun } from "@/lib/run";
import { getStoredSession } from "@/lib/session";
import { GoogleLoginButton } from "@/features/auth/GoogleLoginButton";

const MODES = ["Build", "Plan"];

export function HomeChatBox() {
  const { session } = useAuth();
  const { submit } = useRun();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(MODES[0]);
  const [prompt, setPrompt] = useState(() => searchParams.get("prompt") ?? "");
  const [authError, setAuthError] = useState<string | null>(null);

  const handleSubmit = async () => {
    // Reads localStorage directly rather than the `session` above — this can
    // run right after a Google login resolves, before this component's own
    // re-render lands, so the closed-over `session` would still read stale.
    if (!prompt.trim() || !getStoredSession()) return;
    const text = prompt.trim();
    setPrompt("");
    const runId = await submit(text);
    if (runId) navigate(`/w/${runId}`);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="w-full max-w-2xl">
      <div className="overflow-hidden rounded-2xl border border-border-hover bg-surface shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]">
        <div className="flex items-center gap-1.5 border-b border-border px-3.5 py-2.5 font-mono text-[11px] text-muted-foreground">
          <span className="h-[9px] w-[9px] rounded-full bg-border-hover" />
          <span className="h-[9px] w-[9px] rounded-full bg-border-hover" />
          <span className="h-[9px] w-[9px] rounded-full bg-border-hover" />
          <span className="ml-2">run · new</span>
        </div>

        <div className="px-4 py-4">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Lovable to build a landing page for…"
            rows={2}
            className="text-base"
          />
        </div>

        <div className="flex items-center justify-between border-t border-border px-3.5 py-2.5">
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

            {session ? (
              <button
                onClick={handleSubmit}
                disabled={!prompt.trim()}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-accent text-accent-foreground transition-opacity disabled:opacity-40"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            ) : (
              <GoogleLoginButton
                onSuccess={() => prompt.trim() && handleSubmit()}
                onError={setAuthError}
              />
            )}
          </div>
        </div>
      </div>

      {!session && (
        <p className="mt-3 text-center font-mono text-xs text-muted-foreground">
          {authError ?? "Sign in with Google to start building."}
        </p>
      )}
    </div>
  );
}
