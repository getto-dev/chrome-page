import test from "node:test";
import assert from "node:assert/strict";

function event() {
  const listeners = new Set();
  return {
    addListener(listener) { listeners.add(listener); },
    emit(...args) { for (const listener of listeners) listener(...args); },
    listeners
  };
}

const runtimeMessage = event();
const sentMessages = [];
const bookmarks = {
  getTree: async () => [{
    id: "0",
    children: [{ id: "1", folderType: "bookmarks-bar", children: [] }]
  }],
  onCreated: event(),
  onChanged: event(),
  onRemoved: event(),
  onMoved: event(),
  onChildrenReordered: event(),
  onImportBegan: event(),
  onImportEnded: event()
};

globalThis.chrome = {
  runtime: {
    onMessage: runtimeMessage,
    sendMessage(message) {
      sentMessages.push(message);
      return Promise.resolve();
    }
  },
  bookmarks
};

await import("../worker.js");

function requestLoad() {
  return new Promise((resolve, reject) => {
    const listener = [...runtimeMessage.listeners][0];
    listener({ type: "LOAD_BOOKMARKS" }, {}, response => {
      if (response.success) resolve(response);
      else reject(new Error(response.error));
    });
  });
}

test("worker loads bookmark tree and detects the bookmarks bar", { concurrency: false }, async () => {
  const response = await requestLoad();
  assert.equal(response.success, true);
  assert.equal(response.data.bookmarksBarId, "1");
  assert.equal(response.data.tree[0].id, "0");
});

test("bookmark changes invalidate cache and broadcast an event", { concurrency: false }, async () => {
  sentMessages.length = 0;
  bookmarks.onChanged.emit("2", { title: "Changed" });
  assert.deepEqual(sentMessages, [{
    type: "BOOKMARK_CHANGED",
    data: { id: "2", changes: { title: "Changed" } }
  }]);
});

test("import batches bookmark events into one refresh notification", { concurrency: false }, async () => {
  sentMessages.length = 0;
  bookmarks.onImportBegan.emit();
  bookmarks.onCreated.emit("3", { id: "3", parentId: "1", title: "A" });
  bookmarks.onChanged.emit("3", { title: "B" });
  bookmarks.onImportEnded.emit();

  await Promise.resolve();
  assert.deepEqual(sentMessages, [{ type: "BOOKMARKS_REFRESH", data: null }]);
});

test("stale in-flight loads are discarded and retried after invalidation", { concurrency: false }, async () => {
  sentMessages.length = 0;

  let calls = 0;
  let resolveFirst;
  bookmarks.getTree = () => {
    calls += 1;
    if (calls === 1) {
      return new Promise(resolve => { resolveFirst = resolve; });
    }
    return Promise.resolve([{
      id: "0",
      children: [{ id: "9", folderType: "bookmarks-bar", children: [] }]
    }]);
  };

  const pending = requestLoad();
  await Promise.resolve();

  bookmarks.onChanged.emit("9", { title: "Invalidates in-flight load" });
  resolveFirst([{
    id: "0",
    children: [{ id: "1", folderType: "bookmarks-bar", children: [] }]
  }]);

  const response = await pending;
  assert.equal(calls, 2);
  assert.equal(response.data.bookmarksBarId, "9");
  assert.equal(response.data.tree[0].children[0].id, "9");
  bookmarks.getTree = async () => [{
    id: "0",
    children: [{ id: "1", folderType: "bookmarks-bar", children: [] }]
  }];
  sentMessages.length = 0;
});
