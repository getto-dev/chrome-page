const cache = {
  tree: null,
  bookmarksBarId: null,
  updatedAt: 0
};

let revision = 0;
let loadPromise = null;
let importInProgress = false;
let refreshAfterImport = false;

async function loadTree() {
  const now = Date.now();

  if (cache.tree && now - cache.updatedAt < 30000) {
    return { tree: cache.tree, bookmarksBarId: cache.bookmarksBarId };
  }

  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      while (true) {
        const requestedRevision = revision;
        const tree = await chrome.bookmarks.getTree();

        if (requestedRevision !== revision) continue;
        if (!Array.isArray(tree) || !tree.length) {
          throw new Error("Invalid bookmark tree");
        }

        const root = tree[0];
        const bookmarksBar =
          root.children?.find(node => node.folderType === "bookmarks-bar") ??
          root.children?.[0] ??
          null;

        cache.tree = tree;
        cache.bookmarksBarId = bookmarksBar?.id ?? null;
        cache.updatedAt = Date.now();

        return { tree, bookmarksBarId: cache.bookmarksBarId };
      }
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

function invalidate() {
  revision += 1;
  cache.tree = null;
  cache.bookmarksBarId = null;
  cache.updatedAt = 0;
}

function broadcast(type, data = null) {
  chrome.runtime.sendMessage({ type, data }).catch(() => {});
}

function publish(type, data) {
  invalidate();

  if (importInProgress) {
    refreshAfterImport = true;
    return;
  }

  broadcast(type, data);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "LOAD_BOOKMARKS") {
    sendResponse({ success: false, error: "Unknown message" });
    return false;
  }

  loadTree()
    .then(data => sendResponse({ success: true, data }))
    .catch(error => sendResponse({
      success: false,
      error: error?.message || "Failed to load bookmarks"
    }));

  return true;
});

chrome.bookmarks.onImportBegan?.addListener(() => {
  importInProgress = true;
});

chrome.bookmarks.onImportEnded?.addListener(() => {
  importInProgress = false;
  if (refreshAfterImport) {
    refreshAfterImport = false;
    broadcast("BOOKMARKS_REFRESH");
  }
});

chrome.bookmarks.onCreated.addListener((id, node) => {
  publish("BOOKMARK_CREATED", { id, node });
});

chrome.bookmarks.onChanged.addListener((id, changes) => {
  publish("BOOKMARK_CHANGED", { id, changes });
});

chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  publish("BOOKMARK_REMOVED", {
    id,
    parentId: removeInfo?.parentId ?? null
  });
});

chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
  publish("BOOKMARK_MOVED", { id, moveInfo });
});

chrome.bookmarks.onChildrenReordered.addListener((id, reorderInfo) => {
  publish("BOOKMARKS_REORDERED", {
    folderId: id,
    childIds: reorderInfo?.childIds ?? []
  });
});
