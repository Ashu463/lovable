import { beforeEach, describe, expect, test } from "bun:test";
import { getStoredSession, setStoredSession, type Session } from "./session";

const STORAGE_KEY = "lovable.session";

function installLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
  (globalThis as { localStorage?: unknown }).localStorage = localStorage;
  return store;
}

const session: Session = {
  token: "jwt-token",
  user: {
    id: "u1",
    email: "user@example.com",
    name: "Ada",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
};

let store: Map<string, string>;

beforeEach(() => {
  store = installLocalStorage();
});

describe("setStoredSession", () => {
  test("writes the session as JSON under the lovable.session key", () => {
    setStoredSession(session);

    expect(JSON.parse(store.get(STORAGE_KEY)!)).toEqual(session);
  });

  test("clears the key when passed null", () => {
    store.set(STORAGE_KEY, JSON.stringify(session));

    setStoredSession(null);

    expect(store.has(STORAGE_KEY)).toBe(false);
  });

  test("overwrites a previously stored session", () => {
    setStoredSession(session);
    setStoredSession({ ...session, token: "new-token" });

    expect(getStoredSession()?.token).toBe("new-token");
  });
});

describe("getStoredSession", () => {
  test("returns null when nothing is stored", () => {
    expect(getStoredSession()).toBeNull();
  });

  test("round-trips a session written by setStoredSession", () => {
    setStoredSession(session);

    expect(getStoredSession()).toEqual(session);
  });

  test("returns null instead of throwing on corrupted JSON", () => {
    store.set(STORAGE_KEY, "{not-json");

    expect(getStoredSession()).toBeNull();
  });

  test("returns null for an empty stored value", () => {
    store.set(STORAGE_KEY, "");

    expect(getStoredSession()).toBeNull();
  });
});
