import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { gql, setUnauthenticatedHandler } from "@/lib/graphql";
import {
  getStoredSession,
  setStoredSession,
  type PublicUser,
  type Session,
} from "@/lib/session";
import GOOGLE_SIGN_IN from "@/graphql/googleSignIn.graphql?raw";
import ME from "@/graphql/me.graphql?raw";

interface AuthContextValue {
  session: Session | null;
  // True when the server rejected a stored token rather than the user choosing
  // to leave, so the sign-in UI can explain why they're back at it.
  sessionExpired: boolean;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => getStoredSession());
  const [sessionExpired, setSessionExpired] = useState(false);

  const signInWithGoogle = useCallback(async (idToken: string) => {
    const res = await gql<{ googleSignIn: Session }>(
      GOOGLE_SIGN_IN,
      { idToken },
      { auth: false },
    );
    setStoredSession(res.googleSignIn);
    setSession(res.googleSignIn);
    setSessionExpired(false);
  }, []);

  const signOut = useCallback(() => {
    setStoredSession(null);
    setSession(null);
    setSessionExpired(false);
  }, []);

  // Any request answered with UNAUTHENTICATED means the token no longer names a
  // live account, so the session is dropped mid-flight and the sign-in UI comes
  // back on its own rather than the app pretending to still be logged in.
  useEffect(() => {
    setUnauthenticatedHandler(() => {
      setStoredSession(null);
      setSession(null);
      setSessionExpired(true);
    });
    return () => setUnauthenticatedHandler(null);
  }, []);

  // A JWT stays signature-valid after its user row is deleted, so localStorage
  // can't be trusted on its own — ask the server once per mount.
  useEffect(() => {
    if (!getStoredSession()) return;
    gql<{ me: PublicUser }>(ME)
      .then((res) =>
        setSession((prev) => {
          if (!prev) return prev;
          const next = { ...prev, user: res.me };
          setStoredSession(next);
          return next;
        }),
      )
      .catch(() => {
        // UNAUTHENTICATED already cleared the session via the handler above;
        // anything else (server down, offline) leaves it alone.
      });
  }, []);

  const value = useMemo(
    () => ({ session, sessionExpired, signInWithGoogle, signOut }),
    [session, sessionExpired, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
