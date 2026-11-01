import { z } from "zod";
import type { DiscoverySource, DiscoveredArticle } from "../ports";
import { validatePublicUrl } from "./safe-fetch";
import { NEWS_WINDOW_DAYS, topicQuery, usableArticle } from "./quality";

// Pin the documented toolkit release so a provider update cannot silently change the contract.
export const COMPOSIO_SEARCH_VERSION = "20260903_00";
const endpoint = "https://backend.composio.dev/api/v3/tools/execute/COMPOSIO_SEARCH_WEB";

export interface ComposioDiscoveryOptions {
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  now?: () => Date;
}

const envelopeSchema = z.object({ successful: z.boolean(), data: z.unknown(), error: z.unknown().optional() });
const resultsSchema = z.object({
  results: z.object({ citations: z.array(z.unknown()).optional(), organic_results: z.array(z.unknown()).optional() }),
});
const candidateSchema = z.object({
  url: z.string().nullish(), link: z.string().nullish(),
  title: z.string().nullish(), name: z.string().nullish(),
  published_at: z.string().nullish(), publishedDate: z.string().nullish(), date: z.string().nullish(),
});

/** Server-side, auth-free hosted search; the project key never leaves the fixed API origin. */
export function createComposioDiscoverySource(options: ComposioDiscoveryOptions = {}): DiscoverySource {
  return { kind: "composio", discover: async (interest, parentSignal) => {
    const key = options.apiKey === undefined ? process.env.COMPOSIO_API_KEY : options.apiKey;
    if (!key?.trim()) return [];
    const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 15_000), ...(parentSignal ? [parentSignal] : [])]);
    signal.throwIfAborted();
    // Search summaries are never research facts: only linked articles reach the reader and AI.
    const query = `(${topicQuery(interest, "web")}) when:${NEWS_WINDOW_DAYS}d`;
    const response = await (options.fetchImpl ?? fetch)(endpoint, {
      method: "POST", redirect: "error", signal,
      headers: { "x-api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ version: COMPOSIO_SEARCH_VERSION, user_id: "alias-research", arguments: { query } }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      // Do not expose provider bodies: they may contain credentials or account details.
      throw new Error(`Composio search failed with HTTP ${response.status}.`);
    }
    const payload = envelopeSchema.safeParse(await readJson(response, options.maxBytes ?? 1_000_000, signal));
    if (!payload.success || !payload.data.successful || payload.data.error) throw new Error("Composio search returned an unsuccessful response.");
    const parsed = resultsSchema.safeParse(payload.data.data);
    if (!parsed.success) throw new Error("Composio search returned an unsupported results format.");
    const { citations, organic_results: organic } = parsed.data.results;
    if (!citations && !organic) throw new Error("Composio search did not return article results.");
    const articles: DiscoveredArticle[] = [];
    const seen = new Set<string>();
    const entries = [...(citations ?? []), ...(organic ?? [])].slice(0, 100);
    let recognizedLinks = 0;
    for (const entry of entries) {
      const item = candidateSchema.safeParse(entry);
      if (!item.success) continue;
      const rawUrl = item.data.url?.trim() || item.data.link?.trim();
      if (!rawUrl) continue;
      recognizedLinks++;
      try {
        const url = validatePublicUrl(rawUrl);
        url.hash = "";
        if (seen.has(url.href)) continue;
        seen.add(url.href);
        const date = item.data.published_at ?? item.data.publishedDate ?? item.data.date;
        // Relative descriptions ("yesterday") aren't reliable publication timestamps.
        const timestamp = date && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(date) ? Date.parse(date) : NaN;
        articles.push({ url: url.href, title: (item.data.title?.trim() || item.data.name?.trim() || url.hostname).slice(0, 1000),
          kind: "composio", publishedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null });
      } catch { /* Invalid/private links are discarded; the article reader also checks and pins DNS. */ }
      if (articles.length >= 25) break;
    }
    if (entries.length && !recognizedLinks) throw new Error("Composio search returned an unsupported article format.");
    return articles.filter(article => usableArticle(article, interest, (options.now ?? (() => new Date()))()));
  }};
}

async function readJson(response: Response, maxBytes: number, signal: AbortSignal): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new Error("Composio search response exceeded the byte limit.");
  }
  if (!response.body) throw new Error("Composio search returned an empty response.");
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    signal.throwIfAborted();
    while (true) {
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new Error("Composio search response exceeded the byte limit.");
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new Error("Composio search returned invalid JSON."); }
  } finally { signal.removeEventListener("abort", abort); reader.releaseLock(); }
}
