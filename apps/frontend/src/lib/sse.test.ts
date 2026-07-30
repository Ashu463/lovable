import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setStoredSession, type Session } from "./session";
import { openEventStream } from "./sse";

const realFetch = globalThis.fetch;
const encoder = new TextEncoder();

interface Call {
  url: string;
  init: RequestInit;
}

let calls: Call[];

// Streams the given chunks, one per read, so the parser sees the same partial
// frames it would over the wire.
function stubStream(chunks: string[], opts: { status?: number; withBody?: boolean } = {}) {
  const status = opts.status ?? 200;
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    let i = 0;
    const body = {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { value: encoder.encode(chunks[i++]!), done: false }
            : { value: undefined, done: true },
      }),
    };
    return {
      ok: status >= 200 && status < 300,
      status,
      body: opts.withBody === false ? null : body,
    } as unknown as Response;
  }) as typeof fetch;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

describe("openEventStream parsing", () => {
  test("emits the data payload of each complete frame", async () => {
    stubStream(['data: {"type":"a"}\n\n', 'data: {"type":"b"}\n\n']);
    const messages: string[] = [];

    openEventStream("/api/runs/r1/stream", { onMessage: (d) => messages.push(d) });
    await flush();

    expect(messages).toEqual(['{"type":"a"}', '{"type":"b"}']);
  });

  test("reassembles a frame split across chunks", async () => {
    stubStream(['data: {"ty', 'pe":"a"}\n', '\ndata: {"type":"b"}\n\n']);
    const messages: string[] = [];

    openEventStream("/api/runs/r1/stream", { onMessage: (d) => messages.push(d) });
    await flush();

    expect(messages).toEqual(['{"type":"a"}', '{"type":"b"}']);
  });

  test("handles several frames arriving in one chunk", async () => {
    stubStream(["data: one\n\ndata: two\n\ndata: three\n\n"]);
    const messages: string[] = [];

    openEventStream("/api/runs/r1/stream", { onMessage: (d) => messages.push(d) });
    await flush();

    expect(messages).toEqual(["one", "two", "three"]);
  });

  test("ignores comment/heartbeat frames that carry no data line", async () => {
    stubStream([": keep-alive\n\n", "event: ping\n\n", "data: real\n\n"]);
    const messages: string[] = [];

    openEventStream("/api/runs/r1/stream", { onMessage: (d) => messages.push(d) });
    await flush();

    expect(messages).toEqual(["real"]);
  });

  test("reads the data line even when it follows an event line", async () => {
    stubStream(["event: progress\ndata: payload\n\n"]);
    const messages: string[] = [];

    openEventStream("/api/runs/r1/stream", { onMessage: (d) => messages.push(d) });
    await flush();

    expect(messages).toEqual(["payload"]);
  });

  test("drops a trailing frame that never got its blank-line terminator", async () => {
    stubStream(["data: complete\n\ndata: incomplete"]);
    const messages: string[] = [];

    openEventStream("/api/runs/r1/stream", { onMessage: (d) => messages.push(d) });
    await flush();

    expect(messages).toEqual(["complete"]);
  });
});

describe("openEventStream auth", () => {
  test("sends the bearer token and userid header when a session exists", async () => {
    setStoredSession(session);
    stubStream([]);

    openEventStream("/api/runs/r1/stream", { onMessage: () => {} });
    await flush();

    expect(calls[0]!.url).toBe("/api/runs/r1/stream");
    expect(calls[0]!.init.headers).toEqual({
      Authorization: "Bearer jwt-token",
      userid: "u1",
    });
  });

  test("sends no auth headers when there is no session", async () => {
    stubStream([]);

    openEventStream("/api/runs/r1/stream", { onMessage: () => {} });
    await flush();

    expect(calls[0]!.init.headers).toEqual({});
  });
});

describe("openEventStream failure handling", () => {
  test("reports a non-ok response through onError", async () => {
    stubStream([], { status: 500 });
    const errors: unknown[] = [];

    openEventStream("/api/runs/r1/stream", { onMessage: () => {}, onError: (e) => errors.push(e) });
    await flush();

    expect((errors[0] as Error).message).toBe("Stream request failed (500)");
  });

  test("reports a missing response body through onError", async () => {
    stubStream([], { withBody: false });
    const errors: unknown[] = [];

    openEventStream("/api/runs/r1/stream", { onMessage: () => {}, onError: (e) => errors.push(e) });
    await flush();

    expect((errors[0] as Error).message).toBe("Stream request failed (200)");
  });

  test("swallows the abort triggered by the returned cleanup function", async () => {
    globalThis.fetch = ((_url: string, init: RequestInit = {}) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("The operation was aborted.")));
      })) as typeof fetch;
    const errors: unknown[] = [];

    const close = openEventStream("/api/runs/r1/stream", {
      onMessage: () => {},
      onError: (e) => errors.push(e),
    });
    close();
    await flush();

    expect(errors).toEqual([]);
  });

  test("tolerates a missing onError handler", async () => {
    stubStream([], { status: 500 });

    expect(() => openEventStream("/api/runs/r1/stream", { onMessage: () => {} })).not.toThrow();
    await flush();
  });
});
