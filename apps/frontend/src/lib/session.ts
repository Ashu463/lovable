export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface Session {
  token: string;
  user: PublicUser;
}

const STORAGE_KEY = "lovable.session";

export function getStoredSession(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setStoredSession(session: Session | null) {
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}
