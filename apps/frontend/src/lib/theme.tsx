import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Mode = "light" | "dark";
export type Accent = "purple" | "orange";

const MODE_KEY = "lovable.theme";
const ACCENT_KEY = "lovable.accent";

interface ThemeContextValue {
  theme: Mode;
  toggle: () => void;
  accent: Accent;
  setAccent: (accent: Accent) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialMode(): Mode {
  const stored = localStorage.getItem(MODE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function getInitialAccent(): Accent {
  const stored = localStorage.getItem(ACCENT_KEY);
  return stored === "orange" ? "orange" : "purple";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Mode>(getInitialMode);
  const [accent, setAccentState] = useState<Accent>(getInitialAccent);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem(MODE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.toggle("theme-orange", accent === "orange");
    localStorage.setItem(ACCENT_KEY, accent);
  }, [accent]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  const setAccent = (next: Accent) => setAccentState(next);

  return (
    <ThemeContext.Provider value={{ theme, toggle, accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
