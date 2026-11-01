import assert from "node:assert/strict";
import test from "node:test";
import type { Interest } from "@/contracts";
import { createArticleReader, createDiscoverySources, validatePublicUrl } from "../src/server/research";
import { responseFromBytes } from "../src/server/research/safe-fetch";

const interest: Interest = { id: "i1", identityId: "id1", name: "NBA", searchTerms: ["Toronto Raptors"], feedUrls: [],
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
const feed = (items: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>test</title>${items}</channel></rss>`;
const item = (url: string, title = "Story") => `<item><title>${title}</title><link>${url}</link><pubDate>Mon, 01 Jun 2026 12:00:00 GMT</pubDate></item>`;

test("RSS topic pack parses entries, deduplicates URLs, and drops unsafe URLs", async () => {
  const fetchImpl = async (input: RequestInfo | URL) => new Response(feed(
    item("https://example.com/story#top") + item("https://example.com/story", "Duplicate") + item("http://127.0.0.1/admin", "Local")), { status: 200 });
  const sources = createDiscoverySources({ fetchImpl: fetchImpl as typeof fetch, lookupImpl: publicLookup });
  const result = await sources.find(source => source.kind === "rss")!.discover(interest);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.url, "https://example.com/story");
  assert.equal(result[0]?.kind, "rss");
  assert.equal(result[0]?.publishedAt, "2026-06-01T12:00:00.000Z");
});

test("Google News, HN, Reddit, and Wikipedia discovery adapters parse their public response formats", async () => {
  const fetchImpl = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("news.google.com")) return new Response(feed(item("https://news.example/story", "News")));
    if (url.includes("hn.algolia.com")) return new Response(JSON.stringify({ hits: [{ title: "HN", url: "https://hn.example/post", created_at: "2026-06-01T00:00:00Z" }] }));
    if (url.includes("reddit.com/search.rss")) return new Response(feed(item("https://www.reddit.com/r/nba/comments/abc/post/", "Reddit")));
    if (url.includes("wikipedia.org/w/api.php")) return new Response(JSON.stringify({ query: { search: [{ title: "Toronto Raptors" }] } }));
    throw new Error(`Unexpected URL ${url}`);
  };
  const sources = createDiscoverySources({ fetchImpl: fetchImpl as typeof fetch, lookupImpl: publicLookup });
  const discover = async (kind: string) => sources.find(source => source.kind === kind)!.discover(interest);
  assert.equal((await discover("google_news"))[0]?.title, "News");
  assert.equal((await discover("hacker_news"))[0]?.url, "https://hn.example/post");
  assert.equal((await discover("reddit"))[0]?.kind, "reddit");
  assert.equal((await discover("wikipedia"))[0]?.url, "https://en.wikipedia.org/wiki/Toronto_Raptors");
});

test("C++ finds sources with only a topic name and preserves literal plus signs", async () => {
  const topic: Interest = { ...interest, name: "C++", searchTerms: [], feedUrls: [] };
  const requests: URL[] = [];
  const fetchImpl = async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.hostname === "news.google.com") return new Response(feed(item("https://example.com/cpp-news")));
    if (url.hostname === "hn.algolia.com") return new Response(JSON.stringify({ hits: [{ title: "C++ news", url: "https://example.com/cpp-hn" }] }));
    if (url.hostname === "www.reddit.com") return new Response(feed(item("https://www.reddit.com/r/cpp/comments/abc/news/")));
    if (url.hostname === "en.wikipedia.org") return new Response(JSON.stringify({ query: { search: [{ title: "C++" }] } }));
    throw new Error(`Unexpected source: ${url}`);
  };
  const sources = createDiscoverySources({ fetchImpl: fetchImpl as typeof fetch, lookupImpl: publicLookup });
  for (const source of sources.filter(source => source.kind !== "rss")) {
    assert.ok((await source.discover(topic)).length > 0, `${source.kind} discovers without custom feeds`);
  }
  assert.equal(requests.length, 4);
  for (const url of requests) {
    const query = url.searchParams.get("q") ?? url.searchParams.get("query") ?? url.searchParams.get("srsearch");
    assert.equal(query, "C++");
    assert.match(url.search, /C%2B%2B/);
  }
});

test("Reddit JSON fallback extracts public posts", async () => {
  const fetchImpl = async (input: RequestInfo | URL) => {
    if (String(input).endsWith("search.rss?q=NBA%20OR%20Toronto%20Raptors&sort=new")) return new Response("not rss");
    return new Response(JSON.stringify({ data: { children: [{ data: { title: "Post", selftext: "Fan reaction", permalink: "/r/nba/comments/1/post/", created_utc: 1780315200 } }] } }));
  };
  const source = createDiscoverySources({ fetchImpl: fetchImpl as typeof fetch, lookupImpl: publicLookup }).find(value => value.kind === "reddit")!;
  assert.equal((await source.discover(interest))[0]?.url, "https://www.reddit.com/r/nba/comments/1/post/");
});

test("ArticleReader extracts HTML and uses structured Reddit/Wikipedia content", async () => {
  const longText = "This is a detailed article. ".repeat(20);
  const fetchImpl = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("reddit.com") && url.endsWith(".json?raw_json=1")) return new Response(JSON.stringify([
      { data: { children: [{ data: { title: "Thread", selftext: "A long fan discussion" } }] } },
    ]));
    if (url.includes("api/rest_v1")) return new Response(JSON.stringify({ title: "Raptors", extract: "A team summary." }));
    return new Response(`<html><body><article><h1>Article</h1><p>${longText}</p></article></body></html>`, { headers: { "content-type": "text/html" } });
  };
  const reader = createArticleReader({ fetchImpl: fetchImpl as typeof fetch, lookupImpl: publicLookup, jinaEnabled: false, now: () => new Date("2026-06-01T00:00:00Z") });
  const html = await reader.read({ url: "https://example.com/article", title: "Article", kind: "rss", publishedAt: null });
  assert.match(html.text, /detailed article/);
  assert.equal(html.source.retrievedAt, "2026-06-01T00:00:00.000Z");
  const reddit = await reader.read({ url: "https://www.reddit.com/r/nba/comments/1/post/", title: "Thread", kind: "reddit", publishedAt: null });
  assert.match(reddit.text, /fan discussion/);
  const wiki = await reader.read({ url: "https://en.wikipedia.org/wiki/Toronto_Raptors", title: "Raptors", kind: "wikipedia", publishedAt: null });
  assert.match(wiki.text, /team summary/);
});

test("public URL validation rejects private hosts and bounded fetch rejects redirects and oversized bodies", async () => {
  for (const url of ["file:///etc/passwd", "http://localhost/a", "http://127.0.0.1/", "http://10.0.0.1/", "http://[::1]/", "http://[::ffff:7f00:1]/", "http://[fe80::1]/", "http://[fd00::1]/", "http://[ff02::1]/", "http://169.254.169.254/"]) {
    assert.throws(() => validatePublicUrl(url));
  }
  let calls = 0;
  const redirectFetch = async () => { calls++; return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/" } }); };
  const reader = createArticleReader({ fetchImpl: redirectFetch as typeof fetch, lookupImpl: publicLookup, jinaEnabled: false });
  await assert.rejects(reader.read({ url: "https://example.com/article", title: "x", kind: "rss", publishedAt: null }), /Private or local hosts/);
  assert.equal(calls, 1);
  const oversizeFetch = async () => new Response("123456", { headers: { "content-length": "6" } });
  const limitedReader = createArticleReader({ fetchImpl: oversizeFetch as typeof fetch, lookupImpl: publicLookup, maxBytes: 5, jinaEnabled: false });
  await assert.rejects(limitedReader.read({ url: "https://example.com/article", title: "x", kind: "rss", publishedAt: null }), /byte limit/);
});

test("DNS results are checked and pinned redirects revalidate every hop", async () => {
  let calls = 0;
  const privateReader = createArticleReader({ fetchImpl: (async () => { calls++; return new Response("no"); }) as typeof fetch,
    lookupImpl: async () => [{ address: "::ffff:7f00:1", family: 6 }], jinaEnabled: false });
  await assert.rejects(privateReader.read({ url: "https://rebind.example/article", title: "x", kind: "rss", publishedAt: null }), /private or local/);
  assert.equal(calls, 0);

  const requested: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL) => {
    requested.push(String(input));
    return requested.length === 1
      ? new Response(null, { status: 301, headers: { location: "https://news.example/final" } })
      : new Response("public body");
  };
  const reader = createArticleReader({ fetchImpl: fetchImpl as typeof fetch, lookupImpl: async host => {
    assert.ok(host === "example.com" || host === "news.example");
    return [{ address: "93.184.216.34", family: 4 }];
  }, jinaEnabled: false });
  assert.equal((await reader.read({ url: "https://example.com/story", title: "Story", kind: "rss", publishedAt: null })).text, "public body");
  assert.deepEqual(requested, ["https://example.com/story", "https://news.example/final"]);
});

test("bounded fetch clears its timeout after a fast mocked request", async () => {
  let requestSignal: AbortSignal | undefined;
  const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestSignal = init?.signal as AbortSignal;
    return new Response("ok");
  };
  const reader = createArticleReader({ fetchImpl: fetchImpl as typeof fetch, lookupImpl: publicLookup, timeoutMs: 10, jinaEnabled: false });
  await reader.read({ url: "https://example.com/story", title: "Story", kind: "rss", publishedAt: null });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(requestSignal?.aborted, false);
});

test("pinned responses use null bodies for HTTP statuses that forbid a body", () => {
  for (const status of [204, 205, 304]) {
    const response = responseFromBytes(status, new Headers(), new Uint8Array([1]));
    assert.equal(response.status, status);
    assert.equal(response.body, null);
  }
});

test("DNS resolution is also covered by the request timeout", async () => {
  const reader = createArticleReader({ lookupImpl: () => new Promise(() => {}), timeoutMs: 10, jinaEnabled: false });
  await assert.rejects(reader.read({ url: "https://slow-dns.example/story", title: "Story", kind: "rss", publishedAt: null }), /timed out/);
});

test("ArticleReader validates kind labels and normalizes invalid publication dates", async () => {
  const reader = createArticleReader({ fetchImpl: (async () => new Response("<html><body><article>Some readable source text.</article></body></html>")) as typeof fetch,
    lookupImpl: publicLookup, jinaEnabled: false });
  const article = { url: "https://example.com/story", title: "Story", kind: "bad-kind", publishedAt: "not a date" };
  await assert.rejects(reader.read(article as never));
  const normalized = await reader.read({ ...article, kind: "rss" } as never);
  assert.equal(normalized.source.publishedAt, null);
});

test("Jina fallback is given only the same vetted public target", async () => {
  const requests: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL) => {
    requests.push(String(input));
    return requests.length === 1 ? new Response("<html><body>short</body></html>") : new Response("Jina article text");
  };
  const reader = createArticleReader({ fetchImpl: fetchImpl as typeof fetch, lookupImpl: publicLookup, jinaEnabled: true });
  await reader.read({ url: "https://example.com/story?x=1", title: "Story", kind: "rss", publishedAt: null });
  assert.equal(requests[1], "https://r.jina.ai/https://example.com/story?x=1");
  await assert.rejects(reader.read({ url: "http://127.0.0.1/story", title: "Bad", kind: "rss", publishedAt: null }));
});
