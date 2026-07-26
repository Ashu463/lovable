import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export function DocPage({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 px-6 py-4 backdrop-blur">
        <Link to="/" className="flex items-center gap-2 text-sm font-medium">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-accent">
            <Sparkles className="h-4 w-4 text-accent-foreground" />
          </span>
          lovable
        </Link>
        <Link to="/" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back home
        </Link>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs tracking-widest text-accent">{eyebrow}</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">{title}</h1>
        <div className="doc-content mt-10">{children}</div>
      </article>
    </div>
  );
}
