export function getTitle(node) {
  return node?.title?.trim() || "Без названия";
}

export function isValidBookmarkUrl(url) {
  if (typeof url !== "string" || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return !["javascript:", "data:", "vbscript:", "blob:"].includes(parsed.protocol)
      && Boolean(parsed.protocol);
  } catch {
    return false;
  }
}

export function isValidHttpUrl(url) {
  if (typeof url !== "string" || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return (parsed.protocol === "http:" || parsed.protocol === "https:")
      && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

export function getFolderDisplayTitle(node, bookmarksBarId = null) {
  if (!node) return "";
  if (node.id === bookmarksBarId || node.folderType === "bookmarks-bar") return "Главная";
  if (node.folderType === "other") return "Другие";
  if (node.folderType === "mobile") return "Мобильные";
  return getTitle(node);
}

export function getFolderPath(map, folderId, rootId) {
  const parts = [];
  const visited = new Set();
  let current = map.get(folderId);

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.id === rootId) {
      parts.push("Главная");
      break;
    }
    parts.push(getFolderDisplayTitle(current, rootId));
    if (current.folderType === "other" || current.folderType === "mobile") break;
    current = current.parentId ? map.get(current.parentId) : null;
  }

  return parts.reverse().join(" / ") || "Папка";
}

export function buildMap(root) {
  const map = new Map();

  function visit(node, parentId = null) {
    if (!node?.id) return;
    if (parentId && !node.parentId) node.parentId = parentId;
    map.set(node.id, node);
    node.children?.forEach(child => visit(child, node.id));
  }

  visit(root);
  return map;
}

export function isDescendantOrSelf(map, candidateId, sourceId) {
  const visited = new Set();
  let current = map.get(candidateId);

  while (current && !visited.has(current.id)) {
    if (current.id === sourceId) return true;
    visited.add(current.id);
    current = current.parentId ? map.get(current.parentId) : null;
  }

  return false;
}

export function createFallbackFavicon(url) {
  const hostname = getHostname(url);
  const base = hostname.split(".")[0] || "site";
  return base.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";
}
