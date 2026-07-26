import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Question } from "../../../../../packages/agents/baml_client/types";
import type { Answers } from "../../../../../packages/agents/types/agentTypes";

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

  const allAnswered = questions.every((_, i) => selected[i] !== undefined);

  return (
    <Card className="w-full max-w-xl p-6 text-left">
      <p className="mb-1 text-xs tracking-widest text-muted-foreground">BEFORE WE START</p>
      <h3 className="mb-5 font-semibold">A couple of things to nail down</h3>

      <div className="space-y-5">
        {questions.map((q, i) => (
          <div key={q.question}>
            <p className="mb-2 text-sm text-foreground">{q.question}</p>
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
