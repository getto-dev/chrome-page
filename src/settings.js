export const DEFAULT_SETTINGS = {
  theme: "system",
  sortMode: "default",
  columns: "auto",
  cardSize: "standard",
  spacing: "standard",
  openInNewTab: true
};

const ENUMS = {
  theme: new Set(["system", "light", "dark"]),
  sortMode: new Set(["default", "name", "date"]),
  columns: new Set(["auto", 2, 3, 4]),
  cardSize: new Set(["compact", "standard", "large"]),
  spacing: new Set(["compact", "standard", "large"])
};

export function normalizeSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  const rawColumns = source.columns === "auto" ? "auto" : Number(source.columns);

  return {
    theme: ENUMS.theme.has(source.theme) ? source.theme : DEFAULT_SETTINGS.theme,
    sortMode: ENUMS.sortMode.has(source.sortMode) ? source.sortMode : DEFAULT_SETTINGS.sortMode,
    columns: ENUMS.columns.has(rawColumns) ? rawColumns : DEFAULT_SETTINGS.columns,
    cardSize: ENUMS.cardSize.has(source.cardSize) ? source.cardSize : DEFAULT_SETTINGS.cardSize,
    spacing: ENUMS.spacing.has(source.spacing) ? source.spacing : DEFAULT_SETTINGS.spacing,
    openInNewTab: typeof source.openInNewTab === "boolean"
      ? source.openInNewTab
      : DEFAULT_SETTINGS.openInNewTab
  };
}

export async function loadSettings() {
  try {
    const result = await chrome.storage.local.get("settings");
    return normalizeSettings(result.settings);
  } catch (error) {
    console.warn("Chrome Page settings load failed; using defaults.", error);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  try {
    await chrome.storage.local.set({ settings: normalized });
  } catch (error) {
    console.warn("Chrome Page settings save failed.", error);
  }
  return normalized;
}
