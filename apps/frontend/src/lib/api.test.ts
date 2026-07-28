import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ApiError, api } from "./api";
import { setStoredSession, type Session } from "./session";

interface Call {
  url: string;
  init: RequestInit;
}

const realFetch = globalThis.fetch;
let calls: Call[];

function stubFetch(response: { status?: number; body?: unknown; invalidJson?: boolean }) {
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const status = response.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (response.invalidJson) throw new Error("Unexpected end of JSON input");
        return response.body;
      },
    } as Response;
  }) as typeof fetch;
}

function headersOf(call: Call): Headers {
  return call.init.headers as Headers;
}

const session: Session = {
  token: "jwt-token",
  user: { id: "u1", email: "user@example.com", name: "Ada", createdAt: "2026-01-01T00:00:00.000Z" },
};

beforeEach(() => {
  calls = [];
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("api verbs", () => {
  test("get issues a GET with no body and no content type", async () => {
    stubFetch({ body: { ok: true } });

    const result = await api.get<{ ok: boolean }>("/api/projects");

    expect(result).toEqual({ ok: true });
    expect(calls[0]!.url).toBe("/api/projects");
    expect(calls[0]!.init.method).toBe("GET");
    expect(calls[0]!.init.body).toBeUndefined();
    expect(headersOf(calls[0]!).get("Content-Type")).toBeNull();
  });

  test("post serializes the body as JSON and sets the content type", async () => {
    stubFetch({ body: { id: "p1" } });

    await api.post("/api/projects", { name: "site" });

    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.body).toBe(JSON.stringify({ name: "site" }));
    expect(headersOf(calls[0]!).get("Content-Type")).toBe("application/json");
  });

  test("patch sends a PATCH with the serialized body", async () => {
    stubFetch({ body: { id: "p1", starred: true } });

    await api.patch("/api/projects/p1", { starred: true });

    expect(calls[0]!.init.method).toBe("PATCH");
    expect(calls[0]!.init.body).toBe(JSON.stringify({ starred: true }));
  });

  test("post without a body sends no body and no content type", async () => {
    stubFetch({ body: {} });

    await api.post("/api/runs/r1/cancel");

    expect(calls[0]!.init.body).toBeUndefined();
    expect(headersOf(calls[0]!).get("Content-Type")).toBeNull();
  });
});

describe("api auth headers", () => {
  test("sends the bearer token and the raw userid header when a session exists", async () => {
    setStoredSession(session);
    stubFetch({ body: {} });

    await api.get("/api/projects");

    expect(headersOf(calls[0]!).get("Authorization")).toBe("Bearer jwt-token");
    expect(headersOf(calls[0]!).get("userid")).toBe("u1");
  });

  test("omits auth headers when there is no stored session", async () => {
    stubFetch({ body: {} });

    await api.get("/api/projects");

    expect(headersOf(calls[0]!).get("Authorization")).toBeNull();
    expect(headersOf(calls[0]!).get("userid")).toBeNull();
  });

  test("omits auth headers when auth is explicitly disabled", async () => {
    setStoredSession(session);
    stubFetch({ body: {} });

    await api.post("/api/auth/login", { email: "user@example.com" }, { auth: false });

    expect(headersOf(calls[0]!).get("Authorization")).toBeNull();
    expect(headersOf(calls[0]!).get("Content-Type")).toBe("application/json");
  });

  test("keeps caller-supplied headers alongside the auth headers", async () => {
    setStoredSession(session);
    stubFetch({ body: {} });

    await api.get("/api/projects", { headers: { "X-Trace": "abc" } });

    expect(headersOf(calls[0]!).get("X-Trace")).toBe("abc");
    expect(headersOf(calls[0]!).get("Authorization")).toBe("Bearer jwt-token");
  });
});

describe("api error handling", () => {
  test("throws an ApiError carrying the status and the server message", async () => {
    stubFetch({ status: 404, body: { message: "Project not found" } });

    const error = (await api.get("/api/projects/nope").catch((e) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.message).toBe("Project not found");
  });

  test("falls back to a generic message when the error payload has none", async () => {
    stubFetch({ status: 500, body: {} });

    const error = (await api.get("/api/projects").catch((e) => e)) as ApiError;

    expect(error.status).toBe(500);
    expect(error.message).toBe("Request failed (500)");
  });

  test("falls back to a generic message when the error body is not JSON", async () => {
    stubFetch({ status: 502, invalidJson: true });

    const error = (await api.get("/api/projects").catch((e) => e)) as ApiError;

    expect(error.status).toBe(502);
    expect(error.message).toBe("Request failed (502)");
  });

  test("resolves to null when a successful response has no JSON body", async () => {
    stubFetch({ status: 204, invalidJson: true });

    expect(await api.get("/api/projects")).toBeNull();
  });
});
