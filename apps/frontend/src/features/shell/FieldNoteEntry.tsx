import type { ReactNode } from "react";

export function FieldNoteEntry({
  n,
  tag,
  title,
  children,
}: {
  n: string;
  tag: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div id={tag.toLowerCase().replace(/\s+/g, "-")} className="mt-10 border-t border-border pt-8 first:mt-0 first:border-t-0 first:pt-0">
      <div className="mb-2.5 flex items-center gap-2.5 font-mono text-[11px] text-muted-foreground">
        <span>entry {n}</span>
        <span>·</span>
        <span className="font-medium text-accent">{tag}</span>
      </div>
      <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      <div className="doc-content mt-3">{children}</div>
    </div>
  );
}
