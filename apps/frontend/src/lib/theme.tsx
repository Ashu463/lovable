import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// Control Room is dark-first by design — the instrument-panel aesthetic
// (status line, telemetry, hairline grid) has no coherent light variant, so
// there's only one axis left to manage: which accent signals "live".
export type Accent = "purple" | "neon";

const ACCENT_KEY = "lovable.accent";

interface ThemeContextValue {
  accent: Accent;
  setAccent: (accent: Accent) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialAccent(): Accent {
  const stored = localStorage.getItem(ACCENT_KEY);
  return stored === "neon" ? "neon" : "purple";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<Accent>(getInitialAccent);

  useEffect(() => {
    document.documentElement.classList.toggle("theme-neon", accent === "neon");
    localStorage.setItem(ACCENT_KEY, accent);
  }, [accent]);

  const setAccent = (next: Accent) => setAccentState(next);

  return (
    <ThemeContext.Provider value={{ accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
