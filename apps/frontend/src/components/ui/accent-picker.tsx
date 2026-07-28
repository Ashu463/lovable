import { useTheme, type Accent } from "@/lib/theme";
import { cn } from "@/lib/utils";

const SWATCHES: { id: Accent; label: string; from: string; to: string }[] = [
  { id: "purple", label: "Purple & Magenta", from: "#9327DB", to: "#F722A6" },
  { id: "neon", label: "Neon Blue & Green", from: "#00FFFF", to: "#39FF14" },
];

export function AccentPicker({ expanded = false }: { expanded?: boolean }) {
  const { accent, setAccent } = useTheme();

  return (
    <div className={cn("flex gap-1.5", expanded ? "px-3 py-2" : "flex-col items-center py-1")}>
      {SWATCHES.map((s) => (
        <button
          key={s.id}
          title={s.label}
          onClick={() => setAccent(s.id)}
          className={cn(
            "h-5 w-5 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-surface transition-shadow",
            accent === s.id ? "ring-foreground/70" : "ring-transparent",
          )}
          style={{ background: `linear-gradient(135deg, ${s.from}, ${s.to})` }}
        />
      ))}
      {expanded && <span className="ml-1 self-center text-xs text-muted-foreground">Accent</span>}
    </div>
  );
}
