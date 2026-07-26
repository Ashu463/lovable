import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ expanded = false }: { expanded?: boolean }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "flex items-center gap-2 rounded-xl text-muted transition-colors hover:bg-surface-hover hover:text-foreground",
        expanded ? "w-full px-3 py-2 text-sm" : "h-10 w-10 justify-center",
      )}
    >
      {isDark ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
      {expanded && <span>{isDark ? "Dark" : "Light"} mode</span>}
    </button>
  );
}
