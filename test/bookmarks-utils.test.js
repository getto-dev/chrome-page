import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMap,
  createFallbackFavicon,
  getFolderPath,
  getHostname,
  getTitle,
  isDescendantOrSelf,
  isValidHttpUrl
} from "../src/bookmarks-utils.js";

test("bookmark utilities validate and normalize URLs", () => {
  assert.equal(isValidHttpUrl("https://example.com/path"), true);
  assert.equal(isValidHttpUrl("http://example.com"), true);
  assert.equal(isValidHttpUrl("javascript:alert(1)"), false);
  assert.equal(isValidHttpUrl("not a url"), false);
  assert.equal(getHostname("https://www.Example.com/path"), "example.com");
});

test("bookmark utilities provide safe title and favicon fallback", () => {
  assert.equal(getTitle({ title: "  Example  " }), "Example");
  assert.equal(getTitle({ title: "" }), "Без названия");
  assert.equal(createFallbackFavicon("https://github.com/getto-dev"), "GI");
  assert.equal(createFallbackFavicon("https://пример.рф"), "ПР");
});

test("bookmark map and folder path handle normal trees", () => {
  const root = {
    id: "0", title: "",
    children: [
      { id: "1", title: "Bookmarks bar", folderType: "bookmarks-bar", children: [
        { id: "2", title: "Projects", children: [
          { id: "3", title: "Chrome Page", url: "https://github.com/getto-dev/chrome-page" }
        ] }
      ]
    ]
  };
  const map = buildMap(root);
  assert.equal(map.size, 4);
  assert.equal(map.get("3").parentId, "2");
  assert.equal(getFolderPath(map, "2", "1"), "Главная / Projects");
  assert.equal(isDescendantOrSelf(map, "2", "2"), true);
  assert.equal(isDescendantOrSelf(map, "3", "2"), true);
  assert.equal(isDescendantOrSelf(map, "1", "2"), false);
});

test("bookmark ancestry traversal stops on cycles", () => {
  const map = new Map([
    ["a", { id: "a", parentId: "b" }],
    ["b", { id: "b", parentId: "a" }]
  ]);
  assert.equal(isDescendantOrSelf(map, "a", "missing"), false);
  assert.equal(getFolderPath(map, "a", "root"), "Папка / Папка");
});
