import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { sourceKindSchema } from "@/contracts";
import type { ArticleReader, DiscoveredArticle, ReadArticle } from "../ports";
import { boundedFetch, configFromEnvironment, validatePublicUrl, type FetchOptions } from "./safe-fetch";

export interface ReaderOptions extends FetchOptions { now?: () => Date; jinaEnabled?: boolean }

export function createArticleReader(options: ReaderOptions = {}): ArticleReader {
  const fetchOptions = { ...configFromEnvironment(), ...options };
  const now = options.now ?? (() => new Date());
  const jinaEnabled = options.jinaEnabled ?? process.env.JINA_READER_ENABLED !== "false";
  return { read: async (article: DiscoveredArticle, signal?: AbortSignal): Promise<ReadArticle> => {
    const url = validatePublicUrl(article.url);
    const kind = sourceKindSchema.parse(article.kind);
    let text: string;
    if (kind === "reddit") {
      if (!isHost(url.hostname, "reddit.com")) throw new Error("Reddit articles must use a Reddit host.");
      text = await readReddit(url, fetchOptions, signal);
    } else if (kind === "wikipedia") {
      if (!isHost(url.hostname, "wikipedia.org")) throw new Error("Wikipedia articles must use a Wikipedia host.");
      text = await readWikipedia(url, fetchOptions, signal);
    } else {
      const { text: html, finalUrl } = await boundedFetch(url.toString(), fetchOptions, signal);
      text = extractHtml(html, finalUrl);
      if (text.length < 200 && jinaEnabled && finalUrl === url.toString()) {
        // Validate the target again immediately before embedding it in Jina's fetch URL.
        const target = validatePublicUrl(article.url).toString();
        const { text: jinaText } = await boundedFetch(`https://r.jina.ai/${target}`, fetchOptions, signal);
        text = jinaText.trim();
      }
    }
    if (!text.trim()) throw new Error("No readable article text was found.");
    return { source: { url: url.toString(), title: article.title, kind, publishedAt: normalizeTimestamp(article.publishedAt),
      retrievedAt: now().toISOString() }, text: text.slice(0, 40_000) };
  }};
}

async function readReddit(url: URL, options: FetchOptions, signal?: AbortSignal): Promise<string> {
  const jsonUrl = new URL(url.toString());
  jsonUrl.pathname = `${jsonUrl.pathname.replace(/\/$/, "")}.json`;
  jsonUrl.search = "?raw_json=1";
  const { text } = await boundedFetch(jsonUrl.toString(), options, signal);
  const payload = JSON.parse(text) as Array<{ data?: { children?: Array<{ data?: { title?: string; selftext?: string; permalink?: string } }> } }>;
  const posts = payload.flatMap(list => list.data?.children ?? []).map(child => child.data).filter(Boolean);
  const content = posts.map(post => [post?.title, post?.selftext].filter(Boolean).join("\n\n")).filter(Boolean).join("\n\n");
  if (!content) throw new Error("Reddit response contained no post text.");
  return content;
}

async function readWikipedia(url: URL, options: FetchOptions, signal?: AbortSignal): Promise<string> {
  const title = decodeURIComponent(url.pathname.split("/").pop() ?? "").replace(/_/g, " ");
  if (!title) throw new Error("Wikipedia URL has no article title.");
  const endpoint = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const { text } = await boundedFetch(endpoint, options, signal);
  const summary = JSON.parse(text) as { title?: string; extract?: string; description?: string };
  return [summary.title, summary.description, summary.extract].filter(Boolean).join("\n\n");
}

function extractHtml(html: string, url: string): string {
  const dom = new JSDOM(html, { url });
  try {
    const parsed = new Readability(dom.window.document).parse();
    if (parsed?.textContent?.trim()) return parsed.textContent.trim();
    return dom.window.document.body?.textContent?.trim() ?? "";
  } finally { dom.window.close(); }
}

function isHost(host: string, domain: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  return normalized === domain || normalized.endsWith(`.${domain}`);
}

function normalizeTimestamp(input: string | null): string | null {
  if (input === null) return null;
  const timestamp = new Date(input);
  return Number.isNaN(timestamp.valueOf()) ? null : timestamp.toISOString();
}
