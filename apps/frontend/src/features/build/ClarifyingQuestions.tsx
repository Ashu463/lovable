import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Question } from "../../../../../packages/agents/baml_client/types";
import type { Answers } from "../../../../../packages/agents/types/callAgentTypes";

export function ClarifyingQuestions({
  questions,
  submitting,
  onSubmit,
}: {
  questions: Question[];
  submitting: boolean;
  onSubmit: (answers: Answers[]) => void;
}) {
  const [selected, setSelected] = useState<Record<number, string>>({});

  // A question can arrive with no options (the model is told to always supply
  // them, but that isn't enforceable). Without a text fallback those questions
  // are unanswerable and the run stalls with a permanently disabled Continue.
  const allAnswered = questions.every((_, i) => (selected[i] ?? "").trim() !== "");

  return (
    <Card className="w-full max-w-xl p-6 text-left">
      <p className="mb-1 font-mono text-xs tracking-widest text-accent">BEFORE WE START</p>
      <h3 className="mb-5 font-display font-semibold">A couple of things to nail down</h3>

      <div className="space-y-5">
        {questions.map((q, i) => (
          <div key={q.question}>
            <p className="mb-2 text-sm text-foreground">{q.question}</p>
            {q.option?.length ? (
              <div className="flex flex-wrap gap-2">
                {q.option.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setSelected((prev) => ({ ...prev, [i]: opt }))}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                      selected[i] === opt
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
                value={selected[i] ?? ""}
                onChange={(e) => setSelected((prev) => ({ ...prev, [i]: e.target.value }))}
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
          onSubmit(
            questions.map((q, i) => ({ question: q.question, answer: selected[i]! })),
          )
        }
      >
        {submitting ? "Resuming build…" : "Continue"}
      </Button>
    </Card>
  );
}
