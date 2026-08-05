import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { gql } from "@/lib/graphql";
import { getStoredSession, setStoredSession, type Session } from "@/lib/session";

const GOOGLE_SIGN_IN = `
  mutation GoogleSignIn($idToken: String!) {
    googleSignIn(idToken: $idToken) {
      token
      user { id email name createdAt }
    }
  }
`;

interface AuthContextValue {
  session: Session | null;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => getStoredSession());

  const signInWithGoogle = useCallback(async (idToken: string) => {
    const res = await gql<{ googleSignIn: Session }>(
      GOOGLE_SIGN_IN,
      { idToken },
      { auth: false },
    );
    setStoredSession(res.googleSignIn);
    setSession(res.googleSignIn);
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
