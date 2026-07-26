import { useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
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
import { GoogleLoginButton } from "@/features/auth/GoogleLoginButton";

const MODES = ["Build", "Plan"];

export function HomeChatBox() {
  const { session } = useAuth();
  const { submit } = useRun();
  const navigate = useNavigate();
  const [mode, setMode] = useState(MODES[0]);
  const [prompt, setPrompt] = useState("");

  const handleSubmit = async () => {
    if (!prompt.trim() || !session) return;
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
      <div className="rounded-2xl border border-border bg-surface/80 p-3 backdrop-blur">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Lovable to build a landing page for…"
          rows={2}
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

            {session ? (
              <button
                onClick={handleSubmit}
                disabled={!prompt.trim()}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-accent text-accent-foreground transition-opacity disabled:opacity-40"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            ) : (
              <GoogleLoginButton onSuccess={() => prompt.trim() && handleSubmit()} />
            )}
          </div>
        </div>
      </div>

      {!session && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Sign in with Google to start building.
        </p>
      )}
    </div>
  );
}
