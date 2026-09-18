import test from "node:test";
import assert from "node:assert/strict";
import { getSearchResults, sortChildren } from "../src/search.js";
import { buildMap } from "../src/bookmarks-utils.js";

const root = {
  id: "0", title: "",
  children: [{
    id: "1", title: "Bookmarks", folderType: "bookmarks-bar", children: [
      { id: "2", title: "Exact", url: "https://example.com/exact" },
      { id: "3", title: "Example guide", url: "https://other.test/guide" },
      { id: "4", title: "Other", url: "https://example.com/docs" },
      { id: "5", title: "Nested", children: [
        { id: "6", title: "Path match", url: "https://unrelated.test/item" }
      ] }
    ]
  }]
};
const map = buildMap(root);

test("search ranks exact title before weaker matches", () => {
  const results = getSearchResults(map, "Exact", "1");
  assert.deepEqual(results.map(node => node.id), ["2"]);
});

test("search ranks title prefix above hostname and URL matches", () => {
  const results = getSearchResults(map, "Example", "1");
  assert.equal(results[0].id, "3");
});

test("search still includes URL and folder path matches", () => {
  assert.equal(getSearchResults(map, "docs", "1")[0].id, "4");
  assert.equal(getSearchResults(map, "Nested", "1")[0].id, "6");
});

test("sort preserves Chrome order by default and separates folders for custom sorting", () => {
  const children = [
    { id: "b", title: "B", url: "https://b.test", dateAdded: 1 },
    { id: "folder", title: "A", children: [], dateAdded: 3 },
    { id: "a", title: "A", url: "https://a.test", dateAdded: 2 }
  ];
  assert.deepEqual(sortChildren(children, "default").map(x => x.id), ["b", "folder", "a"]);
  assert.deepEqual(sortChildren(children, "name").map(x => x.id), ["folder", "a", "b"]);
});
