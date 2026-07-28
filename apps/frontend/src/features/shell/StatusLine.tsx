import type { ReactNode } from "react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

// The persistent top strip on every page — the shell's signature element.
// `children` carries page-specific kv pairs; the accent toggle is constant.
export function StatusLine({ children }: { children: ReactNode }) {
  const { accent, setAccent } = useTheme();

  return (
    <header className="flex h-[46px] shrink-0 items-center justify-between border-b border-border bg-surface px-4 font-mono text-xs text-muted">
      <div className="flex items-center gap-3 overflow-x-auto">{children}</div>
      <div className="flex shrink-0 items-center gap-2 pl-3">
        <span className="text-muted-foreground">accent</span>
        <button
          title="Purple & Magenta"
          onClick={() => setAccent("purple")}
          className={cn(
            "h-[15px] w-[15px] rounded-full border transition-shadow",
            accent === "purple" ? "border-border-hover" : "border-transparent opacity-60",
          )}
          style={{ background: "linear-gradient(135deg, #9327DB, #F722A6)" }}
        />
        <button
          title="Neon Blue & Green"
          onClick={() => setAccent("neon")}
          className={cn(
            "h-[15px] w-[15px] rounded-full border transition-shadow",
            accent === "neon" ? "border-border-hover" : "border-transparent opacity-60",
          )}
          style={{ background: "linear-gradient(135deg, #00FFFF, #39FF14)" }}
        />
      </div>
    </header>
  );
}

export function StatusItem({ label, value, live }: { label: string; value: ReactNode; live?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      {live && (
        <span className="relative flex h-[7px] w-[7px]">
          <span className="status-dot absolute inline-flex h-full w-full rounded-full bg-accent" />
        </span>
      )}
      {label} <b className="font-medium text-foreground">{value}</b>
    </span>
  );
}

export function StatusSep() {
  return <span className="text-border-hover">·</span>;
}
