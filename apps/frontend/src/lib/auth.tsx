import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";
import { getStoredSession, setStoredSession, type Session } from "@/lib/session";

interface AuthContextValue {
  session: Session | null;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => getStoredSession());

  const signInWithGoogle = useCallback(async (idToken: string) => {
    const res = await api.post<{ success: boolean; data: Session }>(
      "/api/user/google",
      { idToken },
      { auth: false },
    );
    setStoredSession(res.data);
    setSession(res.data);
  }, []);

  const signOut = useCallback(() => {
    setStoredSession(null);
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({ session, signInWithGoogle, signOut }),
    [session, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
