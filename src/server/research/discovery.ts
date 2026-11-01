import Parser from "rss-parser";
import type { Interest } from "@/contracts";
import type { DiscoveredArticle, DiscoverySource } from "../ports";
import { boundedFetch, configFromEnvironment, validatePublicUrl, type FetchOptions } from "./safe-fetch";
import { createComposioDiscoverySource } from "./composio";
import { NEWS_WINDOW_DAYS, newsCutoff, phraseMatches, topicQuery, topicTerms, usableArticle } from "./quality";

const packs: Record<string, string[]> = {
  nba: ["https://www.espn.com/espn/rss/nba/news"], basketball: ["https://www.espn.com/espn/rss/nba/news"],
  wine: ["https://www.winespectator.com/rss/news"], formula1: ["https://www.autosport.com/rss/f1/news/"],
  f1: ["https://www.autosport.com/rss/f1/news/"], soccer: ["https://www.espn.com/espn/rss/soccer/news"],
};
const parser = new Parser();

export interface DiscoveryOptions extends FetchOptions { now?: () => Date; composioApiKey?: string | null }

export function createDiscoverySources(options: DiscoveryOptions = {}): DiscoverySource[] {
  const fetchOptions = { ...configFromEnvironment(), ...options };
  const now = options.now ?? (() => new Date());
  const rss = (kind: "rss" | "google_news" | "reddit"): DiscoverySource => ({ kind, discover: async (interest, signal) => {
    let feeds: string[];
    if (kind === "rss") {
      const terms = [interest.name, ...interest.searchTerms].map(term => term.toLowerCase());
      feeds = [...new Set([...interest.feedUrls, ...terms.flatMap(term => Object.entries(packs).filter(([key]) => phraseMatches(term, key)).flatMap(([, urls]) => urls))])];
    } else if (kind === "google_news") {
      feeds = [`https://news.google.com/rss/search?q=${encodeURIComponent(`(${topicQuery(interest, "web")}) when:${NEWS_WINDOW_DAYS}d`)}&hl=en-US&gl=US&ceid=US:en`];
    } else {
      feeds = [`https://www.reddit.com/search.rss?q=${encodeURIComponent(topicQuery(interest, "reddit"))}&sort=new&t=month`];
    }
    const articles: DiscoveredArticle[] = [];
    const feedErrors: unknown[] = [];
    for (const feed of feeds) {
      try {
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
            const jsonUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(topicQuery(interest, "reddit"))}&sort=new&t=month&limit=25`;
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
      } catch (error) { feedErrors.push(error); }
    }
    if (!articles.length && feedErrors.length) throw feedErrors[0];
    return dedupe(articles).filter(article => usableArticle(article, interest, now()));
  }});

  const hackerNews: DiscoverySource = { kind: "hacker_news", discover: async (interest, signal) => {
    const endpoint = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(topicQuery(interest, "hacker_news"))}&tags=story&hitsPerPage=25&numericFilters=${encodeURIComponent(`created_at_i>${Math.floor(newsCutoff(now()) / 1000)}`)}`;
    const { text } = await boundedFetch(endpoint, fetchOptions, signal);
    const payload = JSON.parse(text) as { hits?: Array<{ title?: string; url?: string; created_at?: string; objectID?: string }> };
    return dedupe((payload.hits ?? []).map(hit => toArticle(hit.url || (hit.objectID ? `https://news.ycombinator.com/item?id=${hit.objectID}` : ""), hit.title, hit.created_at, "hacker_news", now)).filter(isArticle)).filter(article => usableArticle(article, interest, now()));
  }};

  const wikipedia: DiscoverySource = { kind: "wikipedia", discover: async (interest, signal) => {
    // Exact title lookup preserves punctuation that CirrusSearch may normalize away (e.g. C++).
    const titles = topicTerms(interest).slice(0, 3).map(term => term.replace(/\|/g, " ")).join("|");
    const endpoint = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&formatversion=2&redirects=1&titles=${encodeURIComponent(titles)}&srsearch=${encodeURIComponent(topicQuery(interest, "wikipedia"))}&srlimit=10`;
    const { text } = await boundedFetch(endpoint, fetchOptions, signal);
    const payload = JSON.parse(text) as { query?: { pages?: Array<{ title?: string; missing?: boolean; invalid?: boolean }>; search?: Array<{ title?: string; pageid?: number }> } };
    const hits = [...(payload.query?.pages ?? []).filter(page => !page.missing && !page.invalid), ...(payload.query?.search ?? [])];
    return dedupe(hits.map(hit => toArticle(hit.title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, "_"))}` : "", hit.title, null, "wikipedia", now)).filter(isArticle)).filter(article => usableArticle(article, interest, now()));
  }};
  const key = options.composioApiKey === undefined ? process.env.COMPOSIO_API_KEY : options.composioApiKey;
  const composio = key?.trim() ? [createComposioDiscoverySource({ apiKey: key, fetchImpl: options.fetchImpl, now })] : [];
  return [...composio, rss("rss"), rss("google_news"), hackerNews, rss("reddit"), wikipedia];
}

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
