import { getFolderPath, getHostname, getTitle } from "./bookmarks-utils.js";

export function getSearchResults(map, query, bookmarksBarId) {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [];

  return [...map.values()]
    .filter(node => Boolean(node.url))
    .map(bookmark => {
      const title = getTitle(bookmark).toLocaleLowerCase();
      const url = String(bookmark.url || "").toLocaleLowerCase();
      const hostname = getHostname(bookmark.url || "").toLocaleLowerCase();
      const path = getFolderPath(map, bookmark.parentId, bookmarksBarId).toLocaleLowerCase();
      const score =
        title === q ? 0 :
        title.startsWith(q) ? 10 :
        hostname === q ? 20 :
        hostname.startsWith(q) ? 30 :
        title.includes(q) ? 40 :
        hostname.includes(q) ? 50 :
        url.includes(q) ? 60 :
        path.includes(q) ? 70 : 80;

      return { bookmark, title, url, hostname, path, score };
    })
    .filter(entry =>
      entry.title.includes(q) ||
      entry.url.includes(q) ||
      entry.hostname.includes(q) ||
      entry.path.includes(q)
    )
    .sort((a, b) =>
      a.score - b.score ||
      a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }) ||
      a.url.localeCompare(b.url, undefined, { sensitivity: "base", numeric: true })
    )
    .map(entry => entry.bookmark);
}

export function sortChildren(children, sortMode) {
  const result = [...children];
  if (sortMode === "default") return result;

  const compare = sortMode === "name"
    ? (a, b) => getTitle(a).localeCompare(getTitle(b), undefined, { sensitivity: "base", numeric: true })
    : (a, b) => (b.dateAdded || 0) - (a.dateAdded || 0);

  return [
    ...result.filter(node => !node.url).sort(compare),
    ...result.filter(node => Boolean(node.url)).sort(compare)
  ];
}

export function getCurrentChildren({ map, currentFolderId, searchQuery, sortMode, bookmarksBarId }) {
  if (searchQuery) return getSearchResults(map, searchQuery, bookmarksBarId);
  const folder = map.get(currentFolderId);
  return folder ? sortChildren(folder.children || [], sortMode) : [];
}
