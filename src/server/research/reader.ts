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
    let url = validatePublicUrl(article.url);
    const kind = sourceKindSchema.parse(article.kind);
    const googleNews = isGoogleNews(url);
    let text: string;
    if (kind === "reddit") {
      if (!isHost(url.hostname, "reddit.com")) throw new Error("Reddit articles must use a Reddit host.");
      text = await readReddit(url, fetchOptions, signal);
    } else if (kind === "wikipedia") {
      if (!isHost(url.hostname, "wikipedia.org")) throw new Error("Wikipedia articles must use a Wikipedia host.");
      text = await readWikipedia(url, fetchOptions, signal);
    } else {
      // Older Google RSS IDs embed a publisher link; current IDs can be opaque.
      // Follow only validated public links, never use the redirect/consent page as evidence.
      if (isGoogleNews(url)) url = embeddedGooglePublisher(url) ?? url;
      let fetched = await boundedFetch(url.toString(), fetchOptions, signal);
      if (isGoogleNews(new URL(fetched.finalUrl))) {
        const publisher = googlePublisherFromHtml(fetched.text, fetched.finalUrl);
        if (!publisher) throw new Error("Google News did not expose a readable publisher URL.");
        fetched = await boundedFetch(publisher.toString(), fetchOptions, signal);
      }
      url = validatePublicUrl(fetched.finalUrl);
      if (googleNews && isHost(url.hostname, "google.com")) throw new Error("Google News did not expose a readable publisher URL.");
      text = extractHtml(fetched.text, fetched.finalUrl);
      if (text.length < 200 && jinaEnabled) {
        // Validate the target again immediately before embedding it in Jina's fetch URL.
        const target = validatePublicUrl(url.toString()).toString();
        const { text: jinaText } = await boundedFetch(`https://r.jina.ai/${target}`, fetchOptions, signal);
        text = jinaText.trim();
      }
    }
    if (!text.trim()) throw new Error("No readable article text was found.");
    return { source: { url: url.toString(), title: article.title, kind, publishedAt: normalizeTimestamp(article.publishedAt),
      retrievedAt: now().toISOString() }, text: text.slice(0, 40_000) };
  }};
}

function isGoogleNews(url: URL): boolean { return url.hostname.toLowerCase().replace(/\.$/, "") === "news.google.com"; }

function publisherUrl(value: string, base?: string): URL | null {
  try {
    const url = validatePublicUrl(new URL(value, base).toString());
    if (isHost(url.hostname, "google.com") || isHost(url.hostname, "gstatic.com") || isHost(url.hostname, "googleusercontent.com")) return null;
    return url;
  } catch { return null; }
}

function embeddedGooglePublisher(url: URL): URL | null {
  const token = url.pathname.match(/\/(?:articles|read)\/([A-Za-z0-9_-]+)$/)?.[1];
  if (!token || token.length > 16_000) return null;
  const decoded = Buffer.from(token, "base64url").toString("latin1");
  const matches = decoded.match(/https?:\/\/[^\x00-\x20\x7f-\xff"'<>]+/g) ?? [];
  for (const match of matches) { const target = publisherUrl(match); if (target) return target; }
  return null;
}

function googlePublisherFromHtml(html: string, base: string): URL | null {
  const dom = new JSDOM(html, { url: base });
  try {
    const document = dom.window.document;
    const candidates = [
      document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
      document.querySelector('meta[property="og:url"]')?.getAttribute("content"),
      ...Array.from(document.querySelectorAll('meta[http-equiv]')).filter(meta => meta.getAttribute("http-equiv")?.toLowerCase() === "refresh")
        .map(meta => meta.getAttribute("content")?.match(/url\s*=\s*["']?([^"']+)/i)?.[1]?.trim()),
      ...Array.from(document.querySelectorAll("a[href]")).filter(anchor => /(?:read|go to|open|view) (?:the |full )?(?:article|story)/i.test(`${anchor.textContent} ${anchor.getAttribute("aria-label") ?? ""}`))
        .map(anchor => anchor.getAttribute("href")),
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const target = publisherUrl(candidate, base);
      if (target) return target;
    }
    return null;
  } finally { dom.window.close(); }
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
