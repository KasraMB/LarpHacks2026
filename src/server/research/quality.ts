import type { Interest } from "@/contracts";
import type { DiscoveredArticle } from "../ports";

export const NEWS_WINDOW_DAYS = 30;
export const newsCutoff = (now: Date): number => now.valueOf() - NEWS_WINDOW_DAYS * 86_400_000;

export function topicTerms(interest: Interest): string[] {
  return [...new Set([interest.name, ...interest.searchTerms].map(term => term.trim().replace(/["\\\r\n]/g, " ").replace(/\s+/g, " ")).filter(Boolean))].slice(0, 8);
}

/** Web/Reddit/MediaWiki understand OR; Algolia's query is plain text. */
export function topicQuery(interest: Interest, provider: "web" | "wikipedia" | "hacker_news" | "reddit"): string {
  const terms = topicTerms(interest);
  if (provider === "hacker_news") return (terms[0] ?? "").slice(0, 150);
  return terms.map(term => `${provider === "wikipedia" ? "intitle:" : ""}"${term.slice(0, 90)}"`).join(" OR ");
}

export function phraseMatches(text: string, phrase: string): boolean {
  const normalized = text.normalize("NFKC").toLowerCase().replace(/[_\s-]+/g, " ");
  const needle = phrase.normalize("NFKC").toLowerCase().replace(/[_\s-]+/g, " ");
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Preserve punctuation in topics such as C++ and C#; allow standards such as C++26.
  const end = /[+#]$/.test(needle) ? "(?![\\p{L}+#])" : "(?![\\p{L}\\p{N}])";
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}${end}`, "u").test(normalized);
}

/** Conservative metadata gate: irrelevant candidates never reach reading/fact extraction. */
export function usableArticle(article: DiscoveredArticle, interest: Interest, now: Date): boolean {
  let path = "";
  try { path = decodeURIComponent(new URL(article.url).pathname); } catch { /* Malformed paths cannot establish relevance. */ }
  const terms = topicTerms(interest);
  if (interest.name.trim().toLowerCase() === "c++") terms.push("cpp", "c plus plus");
  if (!terms.some(term => phraseMatches(`${article.title} ${path}`, term))) return false;
  if (article.kind === "wikipedia") return true; // Undated encyclopedia context is background, never dated news.
  if (!article.publishedAt) return true; // Preserve unknown provenance rather than invent a publication date.
  const date = Date.parse(article.publishedAt);
  return Number.isFinite(date) && date >= newsCutoff(now) && date <= now.valueOf() + 86_400_000;
}
