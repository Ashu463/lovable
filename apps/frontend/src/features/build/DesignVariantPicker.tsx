import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DesignOption } from "../../../../../packages/agents/types/agentTypes";

export function DesignVariantPicker({
  designs,
  submitting,
  onSelect,
}: {
  designs: DesignOption[];
  submitting: boolean;
  onSelect: (designId: string) => void;
}) {
  const [pickedId, setPickedId] = useState<string | null>(null);

  return (
    <Card className="w-full max-w-4xl p-6 text-left">
      <p className="mb-1 font-mono text-xs tracking-widest text-accent">DESIGN</p>
      <h3 className="mb-5 font-display font-semibold">Pick a starting point</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {designs.map((design, i) => (
          <button
            key={design.id}
            onClick={() => setPickedId(design.id)}
            className={cn(
              "overflow-hidden rounded-xl border text-left transition-colors",
              pickedId === design.id
                ? "border-accent"
                : "border-border hover:border-border-hover",
            )}
          >
            <div className="h-48 w-full overflow-hidden bg-surface">
              <iframe
                title={`Design variant ${i + 1}`}
                srcDoc={design.htmlContent}
                sandbox=""
                className="h-[800px] w-[1400px] origin-top-left scale-[0.2]"
              />
            </div>
            <p className="px-3 py-2 text-sm text-muted">Variant {i + 1}</p>
          </button>
        ))}
      </div>

      <Button
        className="mt-6 w-full"
        disabled={!pickedId || submitting}
        onClick={() => pickedId && onSelect(pickedId)}
      >
        {submitting ? "Continuing build…" : "Use this design"}
      </Button>
    </Card>
  );
}
