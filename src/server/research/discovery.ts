import Parser from "rss-parser";
import type { Interest } from "@/contracts";
import type { DiscoveredArticle, DiscoverySource } from "../ports";
import { boundedFetch, configFromEnvironment, validatePublicUrl, type FetchOptions } from "./safe-fetch";

const packs: Record<string, string[]> = {
  nba: ["https://www.espn.com/espn/rss/nba/news"], basketball: ["https://www.espn.com/espn/rss/nba/news"],
  wine: ["https://www.winespectator.com/rss/news"], formula1: ["https://www.autosport.com/rss/f1/news/"],
  f1: ["https://www.autosport.com/rss/f1/news/"], soccer: ["https://www.espn.com/espn/rss/soccer/news"],
};
const parser = new Parser();

export interface DiscoveryOptions extends FetchOptions { now?: () => Date }

export function createDiscoverySources(options: DiscoveryOptions = {}): DiscoverySource[] {
  const fetchOptions = { ...configFromEnvironment(), ...options };
  const now = options.now ?? (() => new Date());
  const rss = (kind: "rss" | "google_news" | "reddit"): DiscoverySource => ({ kind, discover: async (interest, signal) => {
    let feeds: string[];
    if (kind === "rss") {
      const terms = [interest.name, ...interest.searchTerms].map(term => term.toLowerCase());
      feeds = [...interest.feedUrls, ...new Set(terms.flatMap(term => Object.entries(packs).filter(([key]) => term.includes(key)).flatMap(([, urls]) => urls)))];
    } else if (kind === "google_news") {
      feeds = [`https://news.google.com/rss/search?q=${encodeURIComponent(queryFor(interest))}&hl=en-US&gl=US&ceid=US:en`];
    } else {
      feeds = [`https://www.reddit.com/search.rss?q=${encodeURIComponent(queryFor(interest))}&sort=new`];
    }
    const articles: DiscoveredArticle[] = [];
    for (const feed of feeds) {
      if (kind === "reddit") {
        let redditParsed = false;
        try {
          const { text } = await boundedFetch(feed, fetchOptions, signal);
          const parsed = await parser.parseString(text);
          articles.push(...parsed.items.map(item => toArticle(item.link, item.title, item.isoDate ?? item.pubDate, kind, now)).filter(isArticle));
          redditParsed = true;
        } catch {
          // Reddit occasionally blocks RSS clients; its public JSON search is the fallback.
        }
        if (!redditParsed) {
          const jsonUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(queryFor(interest))}&sort=new&limit=25`;
          const { text: json } = await boundedFetch(jsonUrl, fetchOptions, signal);
          const payload = JSON.parse(json) as { data?: { children?: Array<{ data?: { permalink?: string; title?: string; created_utc?: number } }> } };
          articles.push(...(payload.data?.children ?? []).map(({ data }) => {
            const url = data?.permalink ? `https://www.reddit.com${data.permalink}` : "";
            return toArticle(url, data?.title, data?.created_utc ? new Date(data.created_utc * 1000).toISOString() : null, kind, now);
          }).filter(isArticle));
        }
      } else {
        const { text } = await boundedFetch(feed, fetchOptions, signal);
        const parsed = await parser.parseString(text);
        articles.push(...parsed.items.map(item => toArticle(item.link, item.title, item.isoDate ?? item.pubDate, kind, now)).filter(isArticle));
      }
    }
    return dedupe(articles);
  }});

  const hackerNews: DiscoverySource = { kind: "hacker_news", discover: async (interest, signal) => {
    const endpoint = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(queryFor(interest))}&tags=story&hitsPerPage=25`;
    const { text } = await boundedFetch(endpoint, fetchOptions, signal);
    const payload = JSON.parse(text) as { hits?: Array<{ title?: string; url?: string; created_at?: string; objectID?: string }> };
    return dedupe((payload.hits ?? []).map(hit => toArticle(hit.url || (hit.objectID ? `https://news.ycombinator.com/item?id=${hit.objectID}` : ""), hit.title, hit.created_at, "hacker_news", now)).filter(isArticle));
  }};

  const wikipedia: DiscoverySource = { kind: "wikipedia", discover: async (interest, signal) => {
    const endpoint = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srsearch=${encodeURIComponent(queryFor(interest))}&srlimit=10`;
    const { text } = await boundedFetch(endpoint, fetchOptions, signal);
    const payload = JSON.parse(text) as { query?: { search?: Array<{ title?: string; pageid?: number }> } };
    return dedupe((payload.query?.search ?? []).map(hit => toArticle(hit.title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, "_"))}` : "", hit.title, null, "wikipedia", now)).filter(isArticle));
  }};
  return [rss("rss"), rss("google_news"), hackerNews, rss("reddit"), wikipedia];
}

function queryFor(interest: Interest): string { return [interest.name, ...interest.searchTerms].filter(Boolean).join(" OR ").slice(0, 300); }
function toArticle(url: string | undefined, title: string | undefined, date: string | null | undefined, kind: DiscoveredArticle["kind"], now: () => Date): DiscoveredArticle | null {
  if (!url || !title?.trim()) return null;
  let safe: URL;
  try { safe = validatePublicUrl(url); } catch { return null; }
  safe.hash = "";
  const published = date ? new Date(date) : null;
  return { url: safe.toString(), title: title.trim(), kind, publishedAt: published && !Number.isNaN(published.valueOf()) ? published.toISOString() : null };
}
function isArticle(article: DiscoveredArticle | null): article is DiscoveredArticle { return article !== null; }
function dedupe(articles: DiscoveredArticle[]): DiscoveredArticle[] {
  const seen = new Set<string>();
  return articles.filter(article => { const key = article.url.replace(/\/$/, ""); if (seen.has(key)) return false; seen.add(key); return true; });
}
