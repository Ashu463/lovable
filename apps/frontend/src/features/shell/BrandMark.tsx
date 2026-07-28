import { cn } from "@/lib/utils";

// Orchestrator branching into two agents — a small node-graph glyph standing
// in for a wordmark, since there's no separate logo asset for this project.
export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-gradient-accent text-accent-foreground",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" fill="none">
        <path
          d="M12 7L6.5 16.2M12 7l5.5 9.2M7 17.5h10"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="12" cy="5.2" r="2.1" fill="currentColor" />
        <circle cx="5.2" cy="18.4" r="2.1" fill="currentColor" />
        <circle cx="18.8" cy="18.4" r="2.1" fill="currentColor" />
      </svg>
    </div>
  );
}
