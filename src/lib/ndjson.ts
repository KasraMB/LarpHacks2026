/** Splits streamed text into complete lines; a chunk may hold half a line or several. */
export function createLineBuffer() {
  let pending = "";
  const clean = (lines: string[]) => lines.map((line) => line.replace(/\r$/, "")).filter((line) => line.trim() !== "");
  return {
    push(text: string): string[] {
      pending += text;
      const parts = pending.split("\n");
      pending = parts.pop() ?? "";
      return clean(parts);
    },
    flush(): string[] {
      const rest = pending;
      pending = "";
      return clean([rest]);
    },
  };
}

export type NdjsonEnd = "eof" | "stopped" | "invalid";

/**
 * Reads an NDJSON body, calling onValue for each complete line. onValue returns true to stop early
 * (a terminal event). Rejects if the read itself fails, e.g. on abort.
 */
export async function readNdjson(
  body: ReadableStream<Uint8Array>,
  onValue: (value: unknown) => boolean,
): Promise<NdjsonEnd> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const lines = createLineBuffer();
  for (;;) {
    const { done, value } = await reader.read();
    const batch = done ? [...lines.push(decoder.decode()), ...lines.flush()] : lines.push(decoder.decode(value, { stream: true }));
    for (const line of batch) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        void reader.cancel().catch(() => {});
        return "invalid";
      }
      if (onValue(parsed)) {
        void reader.cancel().catch(() => {});
        return "stopped";
      }
    }
    if (done) return "eof";
  }
}

export const LIVE_PHRASE_MAX = 1600;

/** Keeps the newest text within the server's transcript limit, starting at a word boundary. */
export function capPhrase(text: string, max = LIVE_PHRASE_MAX): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  const tail = normalized.slice(-max);
  const space = tail.indexOf(" ");
  return space >= 0 && space < 40 ? tail.slice(space + 1) : tail;
}

/** Retry-After in milliseconds; only the delta-seconds form is expected from this server. */
export function retryAfterMs(header: string | null, fallbackSeconds = 1): number {
  const seconds = header === null ? NaN : Number(header);
  return Math.max(1, Number.isFinite(seconds) ? seconds : fallbackSeconds) * 1000;
}
