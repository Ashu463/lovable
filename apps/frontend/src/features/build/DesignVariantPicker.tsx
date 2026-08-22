import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DesignOption } from "../../../../../packages/agents/types/callAgentTypes";

export function DesignVariantPicker({
  designs,
  submitting,
  onSelect,
}: {
  designs: DesignOption[];
  submitting: boolean;
  onSelect: (designId: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = designs[activeIndex];

  const goTo = (i: number) => setActiveIndex((i + designs.length) % designs.length);

  return (
    <Card className="w-full p-6 text-left">
      <p className="mb-1 font-mono text-xs tracking-widest text-accent">DESIGN</p>
      <h3 className="mb-1 font-display font-semibold">Pick a starting point</h3>
      <p className="mb-5 text-sm text-muted">
        Variant {activeIndex + 1} of {designs.length}
      </p>

      {/* Large preview takes ~58% of the viewport height so the design is
          actually readable, not a postage stamp. */}
      <div className="relative h-[58vh] w-full overflow-hidden rounded-xl border border-border bg-surface">
        <iframe
          key={active.id}
          title={`Design variant ${activeIndex + 1}`}
          srcDoc={active.htmlContent}
          // allow-scripts only, deliberately not allow-same-origin: Stitch
          // output loads Tailwind's CDN JIT compiler via <script>, which
          // needs to execute or every utility class renders as unstyled
          // markup. Without allow-same-origin the frame still can't reach
          // our origin's cookies/localStorage or the parent document.
          sandbox="allow-scripts"
          className="h-full w-full"
        />

        {designs.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous design"
              onClick={() => goTo(activeIndex - 1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-border bg-background/80 p-2 backdrop-blur transition-colors hover:border-border-hover"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Next design"
              onClick={() => goTo(activeIndex + 1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-border bg-background/80 p-2 backdrop-blur transition-colors hover:border-border-hover"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {designs.length > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          {designs.map((design, i) => (
            <button
              key={design.id}
              type="button"
              aria-label={`Go to variant ${i + 1}`}
              onClick={() => setActiveIndex(i)}
              className={cn(
                "h-2 rounded-full transition-all",
                i === activeIndex ? "w-6 bg-accent" : "w-2 bg-border hover:bg-border-hover",
              )}
            />
          ))}
        </div>
      )}

      <Button
        className="mt-6 w-full"
        disabled={submitting}
        onClick={() => onSelect(active.id)}
      >
        {submitting ? "Continuing build…" : `Use this design`}
      </Button>
    </Card>
  );
}
