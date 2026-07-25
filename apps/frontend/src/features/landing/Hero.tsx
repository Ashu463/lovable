import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export function Hero({ children }: { children: ReactNode }) {
  return (
    <section id="top" className="hero-glow relative px-6 pb-16 pt-20 text-center">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-xs text-muted">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          Introducing Agent Mode — build full-stack apps hands-free
        </span>

        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
          Build something <span className="text-gradient-accent">Lovable</span>
        </h1>

        <p className="max-w-xl text-lg text-muted">
          Create apps and websites by chatting with AI. Ship real products in
          minutes, not months.
        </p>

        {children}
      </div>
    </section>
  );
}
