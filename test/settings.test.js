import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings.js";

test("settings normalize invalid values to safe defaults", () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({
    theme: "invalid",
    sortMode: "invalid",
    columns: "9",
    cardSize: "invalid",
    ambient: "yes",
    surfaceOpacity: 101,
    backgroundColor: "red",
    openInNewTab: 1
  }), { ...DEFAULT_SETTINGS, surfaceOpacity: 100 });
});

test("settings accept supported values and normalize numeric fields", () => {
  const settings = normalizeSettings({
    theme: "dark",
    sortMode: "date",
    columns: "3",
    cardSize: "large",
    spacing: "compact",
    radius: "sharp",
    blur: "soft",
    ambient: false,
    surfaceOpacity: 78,
    backgroundColor: "#AABBCC",
    openInNewTab: false
  });
  assert.deepEqual(settings, {
    theme: "dark", sortMode: "date", columns: 3, cardSize: "large",
    spacing: "compact", radius: "sharp", blur: "soft", ambient: false,
    surfaceOpacity: 80, backgroundColor: "#AABBCC", openInNewTab: false
  });
});
