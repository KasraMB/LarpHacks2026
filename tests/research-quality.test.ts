import assert from "node:assert/strict";
import test from "node:test";
import type { Interest, ResearchFact, ResearchRun } from "../src/contracts";
import type { ServerDependencies } from "../src/server/ports";
import { createArticleReader, createDiscoverySources } from "../src/server/research";
import { createComposioDiscoverySource } from "../src/server/research/composio";
import { researchErrorDetail } from "../src/server/research/errors";
import { phraseMatches, usableArticle } from "../src/server/research/quality";
import { createWorkers } from "../src/server/workers";

const now = () => new Date("2026-11-01T12:00:00Z");
const topic: Interest = { id: "cpp", identityId: "identity", name: "C++", visibility: "private", searchTerms: [], feedUrls: [],
  createdAt: now().toISOString(), updatedAt: now().toISOString() };
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
const sources = (fetchImpl: typeof fetch) => createDiscoverySources({ now, fetchImpl, lookupImpl: publicLookup, composioApiKey: null });

test("C++ relevance rejects unrelated Wikipedia and stale HN results even when upstream search returns them", async () => {
  const requests: URL[] = [];
  const adapters = sources(async input => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.hostname === "en.wikipedia.org") return Response.json({ query: { pages: [{ title: "C++" }, { title: "Missing page", missing: true }], search: [
      { title: "List of logarithmic identities" }, { title: "2009 Malagasy political crisis" }, { title: "C++26" },
    ] } });
    return Response.json({ hits: [
      { title: "C++ in 2010", url: "https://example.com/old", created_at: "2010-01-01T00:00:00Z" },
      { title: "C programming update", url: "https://example.com/c", created_at: "2026-10-31T00:00:00Z" },
      { title: "C++26 compiler support", url: "https://example.com/new", created_at: "2026-10-31T00:00:00Z" },
    ] });
  });
  assert.deepEqual((await adapters.find(source => source.kind === "wikipedia")!.discover(topic)).map(article => article.title), ["C++", "C++26"]);
  assert.deepEqual((await adapters.find(source => source.kind === "hacker_news")!.discover(topic)).map(article => article.title), ["C++26 compiler support"]);
  assert.equal(requests[0]!.searchParams.get("srsearch"), 'intitle:"C++"');
  assert.equal(requests[0]!.searchParams.get("titles"), "C++");
  assert.match(requests[1]!.searchParams.get("numericFilters")!, /^created_at_i>\d+$/);
  assert.equal(requests[1]!.searchParams.get("query"), "C++");
});

test("RSS packs match complete topic names instead of substrings and one broken feed does not discard a working feed", async () => {
  let calls = 0;
  const adapters = sources(async input => {
    calls++;
    if (String(input).includes("broken")) return new Response("not allowed", { status: 403 });
    return new Response('<rss version="2.0"><channel><title>Feed</title><item><title>C++ update</title><link>https://example.com/cpp</link><pubDate>Sat, 31 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>');
  });
  const rss = adapters.find(source => source.kind === "rss")!;
  assert.deepEqual(await rss.discover({ ...topic, name: "Profile f123", searchTerms: ["wineglass"] }), []);
  assert.equal(calls, 0);
  assert.equal((await rss.discover({ ...topic, feedUrls: ["https://broken.example/feed", "https://good.example/feed"] })).length, 1);
  assert.equal(calls, 2);
  assert.equal(phraseMatches("Latest F1 results", "f1"), true);
  assert.equal(phraseMatches("F123", "f1"), false);
});

test("freshness gates news while retaining relevant undated Wikipedia background; unknown dates remain unknown", () => {
  const base = { title: "C++ update", url: "https://example.com/cpp", kind: "rss" as const, publishedAt: "2010-01-01T00:00:00Z" };
  assert.equal(usableArticle(base, topic, now()), false);
  assert.equal(usableArticle({ ...base, publishedAt: "2027-01-01T00:00:00Z" }, topic, now()), false);
  assert.equal(usableArticle({ ...base, publishedAt: null }, topic, now()), true);
  assert.equal(usableArticle({ ...base, kind: "wikipedia", publishedAt: null }, topic, now()), true);
  assert.equal(usableArticle({ ...base, title: "C update", url: "https://example.com/c", publishedAt: null }, topic, now()), false);
});

test("Composio search drops irrelevant and stale links before article reading", async () => {
  const source = createComposioDiscoverySource({ apiKey: "test", now, fetchImpl: async () => Response.json({ successful: true,
    data: { results: { citations: [
      { title: "C++ news", url: "https://example.com/current", published_at: "2026-10-31T00:00:00Z" },
      { title: "C++ news", url: "https://example.com/old", published_at: "2010-01-01T00:00:00Z" },
      { title: "Political crisis", url: "https://example.com/politics", published_at: "2026-10-31T00:00:00Z" },
    ] } } }) });
  assert.deepEqual((await source.discover(topic)).map(article => article.url), ["https://example.com/current"]);
});

test("Google News HTTP and HTML redirects resolve to the publisher and keep publisher provenance", async () => {
  for (const htmlRedirect of [false, true]) {
    const requested: string[] = [];
    const reader = createArticleReader({ now, jinaEnabled: false, lookupImpl: publicLookup, fetchImpl: async input => {
      requested.push(String(input));
      if (requested.length === 1) return htmlRedirect
        ? new Response('<html><head><link rel="canonical" href="https://publisher.example/cpp"></head><body>Google News redirect</body></html>')
        : new Response(null, { status: 302, headers: { location: "https://publisher.example/cpp" } });
      return new Response('<html><body><article><p>C++ compiler support has improved.</p></article></body></html>');
    } });
    const read = await reader.read({ url: "https://news.google.com/rss/articles/opaque-token", title: "C++ news", kind: "google_news", publishedAt: null });
    assert.match(read.text, /compiler support/);
    assert.equal(read.source.url, "https://publisher.example/cpp");
    assert.equal(requested.length, 2);
  }
});

test("Google News opaque redirect pages are rejected, and publisher targets keep private-DNS protection", async () => {
  let calls = 0;
  const reader = createArticleReader({ jinaEnabled: true, lookupImpl: publicLookup, fetchImpl: async () => {
    calls++;
    return new Response('<html><body>Google News <a href="https://example.com/privacy">Privacy</a></body></html>');
  } });
  await assert.rejects(reader.read({ url: "https://news.google.com/rss/articles/opaque-token", title: "C++ news", kind: "google_news", publishedAt: null }), /did not expose a readable publisher URL/);
  assert.equal(calls, 1, "opaque wrappers must not reach Jina or fact extraction");

  const privateReader = createArticleReader({ jinaEnabled: false, lookupImpl: async host => host === "news.google.com" ? publicLookup() : [{ address: "127.0.0.1", family: 4 }],
    fetchImpl: async () => new Response('<link rel="canonical" href="https://rebind.example/story">') });
  await assert.rejects(privateReader.read({ url: "https://news.google.com/rss/articles/opaque-token", title: "C++ news", kind: "google_news", publishedAt: null }), /private or local address/);
});

test("research stores helpful provider-specific errors with bounded sanitized messages and continues on partial failure", async () => {
  const runs: ResearchRun[] = [];
  const run: ResearchRun = { id: "run", interestId: topic.id, trigger: "manual", status: "queued", createdAt: now().toISOString(), startedAt: null, finishedAt: null, factCount: 0, sourceErrors: [], failure: null };
  const worker = createWorkers({ repository: {
    interests: { get: async () => topic },
    research: { getRun: async () => run, saveRun: async (value: ResearchRun) => { runs.push(value); return value; }, upsertFacts: async () => 0 },
  }, discovery: [
    { kind: "composio", discover: async () => { throw new Error("Composio search failed with HTTP 401."); } },
    { kind: "rss", discover: async () => { throw new Error("Request failed with HTTP 403."); } },
    { kind: "reddit", discover: async () => { throw new Error("Request failed with HTTP 429."); } },
    { kind: "hacker_news", discover: async () => [{ url: "https://example.com/cpp", title: "C++ update", kind: "hacker_news", publishedAt: null }] },
  ], reader: { read: async () => ({ source: { url: "https://example.com/cpp", title: "C++ update", kind: "hacker_news", publishedAt: null, retrievedAt: now().toISOString() }, text: "C++ update" }) },
  ai: { extractFacts: async () => [] }, clock: { now: () => now().toISOString() } } as unknown as ServerDependencies).research;
  await worker.execute(run.id);
  const completed = runs.find(value => value.status === "completed")!;
  assert.equal(completed.sourceErrors.length, 3);
  assert.match(completed.sourceErrors[0]!.message, /composio discovery: HTTP 401.*authentication/);
  assert.match(completed.sourceErrors[1]!.message, /rss discovery: HTTP 403.*blocked/);
  assert.match(completed.sourceErrors[2]!.message, /reddit discovery: HTTP 429.*quota/);
  for (const message of ["secret-project-key".repeat(10_000), "Request failed with HTTP 403. secret-project-key", "https://secret:user@provider.example/?token=secret-project-key"]) {
    const detail = researchErrorDetail(new Error(message));
    assert.ok(detail.length < 200);
    assert.ok(!detail.includes("secret-project-key"));
  }
});

test("research persists Wikipedia as background context even when extraction calls it a reported fact", async () => {
  const savedFacts: ResearchFact[] = [];
  const run: ResearchRun = { id: "context-run", interestId: topic.id, trigger: "manual", status: "queued", createdAt: now().toISOString(), startedAt: null, finishedAt: null, factCount: 0, sourceErrors: [], failure: null };
  const articles = [
    { url: "https://en.wikipedia.org/wiki/C%2B%2B", title: "C++", kind: "wikipedia" as const, publishedAt: null },
    { url: "https://example.com/cpp-release", title: "C++ release", kind: "rss" as const, publishedAt: "2026-10-31T12:00:00Z" },
  ];
  const worker = createWorkers({ repository: {
    interests: { get: async () => topic },
    research: { getRun: async () => run, saveRun: async (value: ResearchRun) => value,
      upsertFacts: async (facts: ResearchFact[]) => { savedFacts.push(...facts); return facts.length; } },
  }, discovery: [{ kind: "wikipedia", discover: async () => articles }],
  reader: { read: async (article: typeof articles[number]) => ({ source: { ...article, retrievedAt: now().toISOString() }, text: article.title }) },
  ai: { extractFacts: async () => [{ text: "C++ supports generic programming.", kind: "reported_fact" }] },
  clock: { now: () => now().toISOString() } } as unknown as ServerDependencies).research;
  await worker.execute(run.id);
  assert.equal(savedFacts.length, 2);
  assert.equal(savedFacts[0]!.kind, "context");
  assert.equal(savedFacts[0]!.source.publishedAt, null, "Wikipedia has no invented publication date");
  assert.equal(savedFacts[0]!.source.retrievedAt, now().toISOString());
  assert.equal(savedFacts[1]!.kind, "reported_fact", "news retains the extracted fact kind");
  assert.equal(savedFacts[1]!.source.publishedAt, articles[1]!.publishedAt);
});
