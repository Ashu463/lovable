import type { ReactNode } from "react";
import { Sidebar } from "@/features/shell/Sidebar";
import { StatusLine, StatusItem, StatusSep } from "@/features/shell/StatusLine";

export function FieldNotesPage({
  eyebrow,
  title,
  dek,
  toc,
  hero,
  statusRight,
  children,
}: {
  eyebrow: string;
  title: string;
  dek: string;
  toc?: ReactNode;
  hero?: ReactNode;
  statusRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <StatusLine>
          <StatusItem label="orchestrator" value="online" live />
          <StatusSep />
          {statusRight}
        </StatusLine>

        <main className="flex-1 overflow-y-auto">
          {hero}

          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-6 py-14 sm:px-10 md:grid-cols-[190px_1fr] md:gap-14">
            {toc && (
              <nav className="hidden font-mono text-xs md:sticky md:top-4 md:block md:self-start">
                <p className="mb-3.5 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">On this page</p>
                <div className="flex flex-col gap-2 text-muted">{toc}</div>
              </nav>
            )}

            <article>
              <p className="mb-4 flex items-center gap-3 font-mono text-xs tracking-[0.24em] text-accent uppercase">
                <span className="h-px w-7 bg-accent" />
                {eyebrow}
              </p>
              <h1 className="font-display max-w-[18ch] text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
              <p className="mt-3.5 max-w-[62ch] text-[15px] leading-relaxed text-muted">{dek}</p>
              {children}
            </article>
          </div>
        </main>
      </div>
    </div>
  );
}
