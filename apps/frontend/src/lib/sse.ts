import { getStoredSession } from "@/lib/session";

interface SSEHandlers {
  onMessage: (data: string) => void;
  onError?: (err: unknown) => void;
}

// Native EventSource can't send an Authorization header, and this stream is
// authenticated — so we hand-roll SSE parsing over fetch's readable stream
// instead of using EventSource.
export function openEventStream(path: string, handlers: SSEHandlers): () => void {
  const controller = new AbortController();
  const session = getStoredSession();

  (async () => {
    try {
      const res = await fetch(path, {
        headers: session ? { Authorization: `Bearer ${session.token}` } : {},
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`Stream request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const chunk of events) {
          const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
          if (dataLine) handlers.onMessage(dataLine.slice("data: ".length));
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      handlers.onError?.(err);
    }
  })();

  return () => controller.abort();
}
