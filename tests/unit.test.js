import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMap,
  createFallbackFavicon,
  getFolderPath,
  getHostname,
  isDescendantOrSelf,
  isValidHttpUrl
} from "../src/bookmarks-utils.js";
import { normalizeSettings, DEFAULT_SETTINGS } from "../src/settings.js";

test("URL validation only accepts http and https", () => {
  assert.equal(isValidHttpUrl("https://example.com/a"), true);
  assert.equal(isValidHttpUrl("http://example.com"), true);

  for (const value of [
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///tmp/a",
    "chrome://settings",
    "ftp://example.com",
    "blob:https://example.com/id",
    "not-a-url"
  ]) {
    assert.equal(isValidHttpUrl(value), false, value);
  }
});

test("bookmark map preserves parent relationships", () => {
  const root = {
    id: "0",
    children: [
      {
        id: "1",
        title: "Bookmarks Bar",
        children: [
          {
            id: "2",
            title: "Dev",
            children: [{ id: "3", title: "GitHub", url: "https://github.com" }]
          }
        ]
      }
    ]
  };

  const map = buildMap(root);
  assert.equal(map.get("3").parentId, "2");
  assert.equal(getFolderPath(map, "2", "1"), "Главная / Dev");
  assert.equal(isDescendantOrSelf(map, "2", "1"), false);
  assert.equal(isDescendantOrSelf(map, "2", "2"), true);
});

test("hostname and favicon fallback are deterministic", () => {
  assert.equal(getHostname("https://www.example.com/a"), "example.com");
  assert.equal(createFallbackFavicon("https://github.com"), "GI");
  assert.equal(createFallbackFavicon("https://www.youtube.com"), "YO");
});

test("settings normalization falls back safely", () => {
  assert.deepEqual(
    normalizeSettings({
      theme: "bad",
      sortMode: "bad",
      columns: 99,
      cardSize: "bad",
      spacing: "bad",
      radius: "bad",
      blur: "bad",
      ambient: "yes",
      surfaceOpacity: 500,
      backgroundColor: "red",
      openInNewTab: "yes"
    }),
    {
      ...DEFAULT_SETTINGS,
      surfaceOpacity: 100
    }
  );

  assert.deepEqual(
    normalizeSettings({
      theme: "dark",
      sortMode: "date",
      columns: "auto",
      cardSize: "large",
      spacing: "compact",
      radius: "sharp",
      blur: "soft",
      ambient: false,
      surfaceOpacity: 75,
      backgroundColor: "#112233",
      openInNewTab: false
    }),
    {
      theme: "dark",
      sortMode: "date",
      columns: "auto",
      cardSize: "large",
      spacing: "compact",
      radius: "sharp",
      blur: "soft",
      ambient: false,
      surfaceOpacity: 75,
      backgroundColor: "#112233",
      openInNewTab: false
    }
  );
});
