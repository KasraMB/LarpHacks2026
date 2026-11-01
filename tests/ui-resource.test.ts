import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { listAll, useResource, type Resource } from "../src/lib/use-resource";

test("resources discard stale reads after saves and clear data on route changes or disabled loads", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  const globals = globalThis as unknown as Record<string, unknown>;
  const saved = new Map(["window", "document", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globals, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root")!);
  let current!: Resource<string>;
  function Harness({ resourceKey, load }: { resourceKey: string | null; load: () => Promise<string> }) {
    current = useResource(resourceKey, load);
    return createElement("span", null, current.data);
  }
  const render = async (resourceKey: string | null, load: () => Promise<string>) => {
    await act(async () => { root.render(createElement(Harness, { resourceKey, load })); });
  };
  try {
    let finishOld!: (value: string) => void;
    await render("person-a", () => new Promise(resolve => { finishOld = resolve; }));
    assert.equal(current.loading, true);
    await act(async () => { current.setData("saved-a"); });
    await act(async () => { finishOld("stale-a"); });
    assert.equal(current.data, "saved-a");
    assert.equal(current.loading, false);

    let rejectNext!: (error: Error) => void;
    await render("person-b", () => new Promise((_resolve, reject) => { rejectNext = reject; }));
    assert.equal(current.data, null);
    assert.equal(current.loading, true);
    await act(async () => { rejectNext(new Error("Person B unavailable")); });
    assert.equal(current.data, null);
    assert.equal(current.error?.message, "Person B unavailable");

    let disabledCalls = 0;
    await render(null, async () => { disabledCalls++; return "should not load"; });
    assert.equal(current.data, null);
    assert.equal(current.error, null);
    assert.equal(current.loading, false);
    assert.equal(disabledCalls, 0);
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globals[key];
    }
  }
});

test("UI list aggregation follows opaque cursors and includes every backend page", async () => {
  const cursors: Array<string | null> = [];
  const values = await listAll(async cursor => {
    cursors.push(cursor);
    return cursor === null ? { items: ["first"], nextCursor: "opaque-next" } : { items: ["second"], nextCursor: null };
  });
  assert.deepEqual(values, ["first", "second"]);
  assert.deepEqual(cursors, [null, "opaque-next"]);
});
