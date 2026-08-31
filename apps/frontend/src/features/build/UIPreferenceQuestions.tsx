import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { UIPreferenceQuestion as UIPreferenceQuestionType } from "../../../../../packages/agents/types/callAgentTypes";

export function UIPreferenceQuestions({
  questions,
  submitting,
  onSubmit,
}: {
  questions: UIPreferenceQuestionType[];
  submitting: boolean;
  onSubmit: (answers: { questionId: string; answer: string }[]) => void;
}) {
  const [selected, setSelected] = useState<Record<string, string>>({});

  // Same text fallback as ClarifyingQuestions — an options-less question is
  // otherwise unanswerable and leaves Continue permanently disabled.
  const allAnswered = questions.every((q) => (selected[q.id] ?? "").trim() !== "");

  return (
    <Card className="w-full max-w-xl p-6 text-left">
      <p className="mb-1 font-mono text-xs tracking-widest text-accent">ONE MORE THING</p>
      <h3 className="mb-5 font-display font-semibold">How should this look?</h3>

      <div className="space-y-5">
        {questions.map((q) => (
          <div key={q.id}>
            <p className="mb-2 text-sm text-foreground">{q.question}</p>
            {q.options.length ? (
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setSelected((prev) => ({ ...prev, [q.id]: opt }))}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                      selected[q.id] === opt
                        ? "border-accent bg-accent/10 text-foreground"
                        : "border-border text-muted hover:text-foreground",
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <Input
                value={selected[q.id] ?? ""}
                onChange={(e) => setSelected((prev) => ({ ...prev, [q.id]: e.target.value }))}
                placeholder="Type your answer…"
              />
            )}
          </div>
        ))}
      </div>

      <Button
        className="mt-6 w-full"
        disabled={!allAnswered || submitting}
        onClick={() =>
          onSubmit(questions.map((q) => ({ questionId: q.id, answer: selected[q.id]! })))
        }
      >
        {submitting ? "Resuming build…" : "Continue"}
      </Button>
    </Card>
  );
}
