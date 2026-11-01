import assert from "node:assert/strict";
import test from "node:test";
import type { Interest } from "../src/contracts";
import { createComposioDiscoverySource, COMPOSIO_SEARCH_VERSION } from "../src/server/research/composio";
import { createArticleReader, createDiscoverySources } from "../src/server/research";

const topic: Interest = { id: "cpp", identityId: "identity", name: "C++", searchTerms: [], feedUrls: [],
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const response = (citations: unknown[], organic_results: unknown[] = []) => Response.json({ successful: true, error: null,
  data: { results: { answer: "An AI summary is not an article or a research fact.", citations, organic_results } } });

test("Composio uses project authentication, a pinned version and a topic-only query; only safe source links become articles", async () => {
  const source = createComposioDiscoverySource({ apiKey: "test-project-key", fetchImpl: async (url, init) => {
    assert.equal(String(url), "https://backend.composio.dev/api/v3/tools/execute/COMPOSIO_SEARCH_WEB");
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("x-api-key"), "test-project-key");
    assert.deepEqual(JSON.parse(String(init?.body)), { version: COMPOSIO_SEARCH_VERSION, user_id: "alias-research", arguments: { query: "C++" } });
    return response([
      { title: "C++ release", url: "https://example.com/release#top", published_at: "2026-10-31T12:00:00Z" },
      { title: "Duplicate", url: "https://example.com/release" },
      { title: "Unsafe", url: "http://127.0.0.1/admin" },
      { title: "Metadata", url: "http://169.254.169.254/" },
      { title: "Unsafe scheme", url: "file:///etc/passwd" },
      { title: "Relative date", link: "https://example.com/context", date: "yesterday" },
      { title: "Missing URL" }, null,
    ], [{ title: "Third source", link: "https://example.com/third", date: "not a date" }]);
  }});
  const articles = await source.discover(topic);
  assert.equal(articles.length, 3);
  assert.deepEqual(articles[0], { url: "https://example.com/release", title: "C++ release", kind: "composio", publishedAt: "2026-10-31T12:00:00.000Z" });
  assert.equal(articles[1]?.publishedAt, null);
  assert.equal(articles[2]?.publishedAt, null);
  assert.ok(articles.every(article => !JSON.stringify(article).includes("AI summary")));
});

test("Composio failures and unsupported formats are explicit without reflecting secret provider bodies", async () => {
  const cases: Array<[() => Response, RegExp]> = [
    [() => new Response("test-project-key", { status: 401 }), /HTTP 401/],
    [() => new Response("quota", { status: 429 }), /HTTP 429/],
    [() => Response.json({ successful: false, error: "test-project-key", data: {} }), /unsuccessful/],
    [() => Response.json({ successful: true, data: { results: { answer: "Summary only" } } }), /article results/],
    [() => Response.json({ successful: true, data: { unexpected: [] } }), /unsupported results format/],
    [() => new Response("test-project-key is not JSON"), /JSON/],
    [() => response([{ unfamiliar_link_field: "https://example.com/story" }]), /unsupported article format/],
  ];
  for (const [makeResponse, expected] of cases) {
    const source = createComposioDiscoverySource({ apiKey: "test-project-key", fetchImpl: async () => makeResponse() });
    await assert.rejects(source.discover(topic), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, expected);
      assert.ok(!error.message.includes("test-project-key"));
      return true;
    });
  }
  assert.deepEqual(await createComposioDiscoverySource({ apiKey: "test", fetchImpl: async () => response([]) }).discover(topic), []);
});

test("Composio response limits apply to declared and streamed sizes; caller abort and timeouts stop requests", async () => {
  const headerCases: HeadersInit[] = [{ "content-length": "500" }, {}];
  for (const headers of headerCases) {
    const source = createComposioDiscoverySource({ apiKey: "test", maxBytes: 20,
      fetchImpl: async () => new Response("x".repeat(500), { headers }) });
    await assert.rejects(source.discover(topic), /byte limit/);
  }
  const controller = new AbortController();
  controller.abort(new Error("caller cancelled"));
  await assert.rejects(createComposioDiscoverySource({ apiKey: "test", fetchImpl: async () => { throw new Error("Must not fetch"); } }).discover(topic, controller.signal), /caller cancelled/);
  const source = createComposioDiscoverySource({ apiKey: "test", timeoutMs: 10, fetchImpl: async (_url, init) => {
    // Model a fetch that stays active until the adapter aborts it.
    return await new Promise<Response>((_resolve, reject) => {
      const keepAlive = setTimeout(() => reject(new Error("Deadline did not fire")), 1000);
      init!.signal!.addEventListener("abort", () => { clearTimeout(keepAlive); reject(init!.signal!.reason); }, { once: true });
    });
  }});
  await assert.rejects(source.discover(topic), /timeout/i);
  const streaming = createComposioDiscoverySource({ apiKey: "test", timeoutMs: 10, fetchImpl: async () => {
    return new Response(new ReadableStream({ start(stream) { stream.enqueue(new TextEncoder().encode('{"successful":')); } }));
  }});
  const keepAlive = setTimeout(() => {}, 1000);
  try { await assert.rejects(streaming.discover(topic), /timeout/i); }
  finally { clearTimeout(keepAlive); }
});

test("Composio is optional, runs alongside existing sources and does not prevent their results on failure", async () => {
  let calls = 0;
  assert.deepEqual(await createComposioDiscoverySource({ apiKey: null, fetchImpl: async () => { calls++; return response([]); } }).discover(topic), []);
  assert.equal(calls, 0);
  assert.equal(createDiscoverySources({ composioApiKey: null }).some(source => source.kind === "composio"), false);
  const sources = createDiscoverySources({ composioApiKey: "test", lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchImpl: async input => {
      const host = new URL(String(input)).hostname;
      if (host === "backend.composio.dev") return new Response("quota", { status: 429 });
      if (host === "hn.algolia.com") return Response.json({ hits: [{ title: "C++ update", url: "https://example.com/update" }] });
      throw new Error("Other sources unavailable in test");
    } });
  assert.equal(sources[0]?.kind, "composio");
  const results = await Promise.allSettled(sources.map(source => source.discover(topic)));
  assert.equal(results[0]?.status, "rejected");
  const hn = results[sources.findIndex(source => source.kind === "hacker_news")]!;
  assert.equal(hn.status, "fulfilled");
  if (hn.status === "fulfilled") assert.equal(hn.value[0]?.url, "https://example.com/update");
});

test("Composio candidates pass through the existing safe article reader with traceable metadata", async () => {
  const [article] = await createComposioDiscoverySource({ apiKey: "test", fetchImpl: async () => response([
    { title: "C++ update", url: "https://example.com/cpp", published_at: "2026-10-31T00:00:00Z" },
  ]) }).discover(topic);
  const text = "A new C++ release improves compiler diagnostics. ".repeat(30);
  const reader = createArticleReader({ jinaEnabled: false, lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }],
    fetchImpl: async () => new Response(`<html><head><title>C++ update</title></head><body><article><p>${text}</p></article></body></html>`) });
  const read = await reader.read(article!);
  assert.equal(read.source.kind, "composio");
  assert.equal(read.source.url, "https://example.com/cpp");
  assert.equal(read.source.publishedAt, "2026-10-31T00:00:00.000Z");
  assert.match(read.text, /compiler diagnostics/);
});
