import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./settings.js";
import { buildMap, createFallbackFavicon, getFolderPath, getHostname, getTitle, isDescendantOrSelf, isValidHttpUrl } from "./bookmarks-utils.js";

const CARD_HEIGHT = { compact: 56, standard: 72, large: 88 };
const state = {
  map: new Map(), rootId: "0", bookmarksBarId: null, settings: { ...DEFAULT_SETTINGS },
  currentFolderId: null, searchQuery: "", children: [], virtualStart: 0, virtualEnd: 0,
  destroyed: false, refreshTimer: 0, refreshInFlight: null, renderFrame: 0,
  menuTargetId: null, menuTrigger: null, dialogResolver: null, dialogValidate: null, dialogReturnFocus: null,
  moveSourceId: null, moveDestinationId: null, settingsSaveTimer: 0
};

const $ = id => document.getElementById(id);
const dom = {
  html: document.documentElement, total: $("bookmark-total"), folderTree: $("folder-tree"),
  folderTitle: $("folder-title"), breadcrumbs: $("breadcrumbs"), bookmarks: $("bookmarks"),
  bookmarkPanel: $("bookmark-panel"), settingsPanel: $("settings-panel"), search: $("search"),
  searchClear: $("search-clear"), settingsButton: $("settings-button"),
  themeButton: $("theme-button"), managerButton: $("manager-button"), ambientToggle: $("ambient-toggle"),
  opacity: $("opacity"), opacityValue: $("opacity-value"), backgroundColor: $("background-color"),
  resetBackground: $("reset-background"), newtabToggle: $("newtab-toggle"), menu: $("menu"),
  dialog: $("dialog"), dialogTitle: $("dialog-title"), dialogMessage: $("dialog-message"),
  dialogField: $("dialog-field"), dialogLabel: $("dialog-label"), dialogInput: $("dialog-input"),
  dialogError: $("dialog-error"), dialogCancel: $("dialog-cancel"), dialogSubmit: $("dialog-submit"),
  moveDialog: $("move-dialog"), moveItem: $("move-item"), moveSearch: $("move-search"),
  moveList: $("move-list"), moveCancel: $("move-cancel"), moveSubmit: $("move-submit"),
  bookmarkTemplate: $("bookmark-template"), folderTemplate: $("folder-template")
};

function clampOpacity(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(55, Math.min(100, Math.round(n / 5) * 5)) : 78;
}

function hexToRgb(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || "")) return "";
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)].join(", ");
}

function getSearchResults(query) {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [];
  return [...state.map.values()]
    .filter(node => Boolean(node.url))
    .map(bookmark => {
      const title = getTitle(bookmark).toLocaleLowerCase();
      const url = String(bookmark.url || "").toLocaleLowerCase();
      const hostname = getHostname(bookmark.url || "").toLocaleLowerCase();
      const path = getFolderPath(state.map, bookmark.parentId, state.bookmarksBarId).toLocaleLowerCase();
      const score = (title === q ? 0 : title.startsWith(q) ? 1 : title.includes(q) ? 2 : 3) + (hostname === q ? 0 : hostname.startsWith(q) ? 1 : 2);
      return { bookmark, title, url, hostname, path, score };
    })
    .filter(entry => entry.title.includes(q) || entry.url.includes(q) || entry.hostname.includes(q) || entry.path.includes(q))
    .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }))
    .map(entry => entry.bookmark);
}

function sortChildren(children) {
  const result = [...children];
  if (state.settings.sortMode === "default") return result;
  const compare = state.settings.sortMode === "name"
    ? (a, b) => getTitle(a).localeCompare(getTitle(b), undefined, { sensitivity: "base", numeric: true })
    : (a, b) => (b.dateAdded || 0) - (a.dateAdded || 0);
  return [...result.filter(node => !node.url).sort(compare), ...result.filter(node => Boolean(node.url)).sort(compare)];
}

function getCurrentChildren() {
  if (state.searchQuery) return getSearchResults(state.searchQuery);
  const folder = state.map.get(state.currentFolderId);
  return folder ? sortChildren(folder.children || []) : [];
}

function applyTheme() { dom.html.dataset.theme = state.settings.theme; }

function applyVisualSettings() {
  dom.html.dataset.blur = state.settings.blur;
  dom.html.dataset.ambient = String(state.settings.ambient);
  dom.html.style.setProperty("--alpha", String(state.settings.surfaceOpacity / 100));
  dom.bookmarks.dataset.view = state.settings.view;
  dom.bookmarks.dataset.columns = String(state.settings.columns);
  dom.bookmarks.dataset.size = state.settings.cardSize;
  dom.bookmarks.dataset.spacing = state.settings.spacing;
  dom.bookmarks.dataset.radius = state.settings.radius;
  dom.opacity.value = String(state.settings.surfaceOpacity);
  dom.opacityValue.textContent = String(state.settings.surfaceOpacity) + "%";
  dom.ambientToggle.checked = state.settings.ambient;
  dom.newtabToggle.checked = state.settings.openInNewTab;
  if (state.settings.backgroundColor) {
    dom.html.style.setProperty("--bg", hexToRgb(state.settings.backgroundColor));
    dom.backgroundColor.value = state.settings.backgroundColor;
  } else {
    dom.html.style.removeProperty("--bg");
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    dom.backgroundColor.value = prefersDark || state.settings.theme === "dark" ? "#080a0f" : "#f5f5f7";
  }
  document.querySelectorAll("[data-setting] button").forEach(button => {
    const key = button.closest("[data-setting]")?.dataset.setting;
    const active = Boolean(key && String(state.settings[key]) === button.dataset.value);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const searchKbd = $("search-kbd");
  if (searchKbd) searchKbd.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K";
}

function calculateColumns() {
  if (state.settings.columns !== "auto") {
    return Math.max(1, Math.min(4, Number(state.settings.columns) || 3));
  }
  const style = getComputedStyle(dom.bookmarks);
  const width = Math.max(0, dom.bookmarks.clientWidth);
  const gap = parseFloat(style.columnGap) || 18;
  const minWidth = parseFloat(style.getPropertyValue("--card-min-width")) || 220;
  return Math.max(1, Math.min(4, Math.floor((width + gap) / (minWidth + gap))));
}

function updateColumns() { dom.bookmarks.style.setProperty("--auto-columns", String(calculateColumns())); }
function scheduleRender(force = false) {
  if (state.destroyed || state.renderFrame) return;
  state.renderFrame = requestAnimationFrame(() => { state.renderFrame = 0; renderBookmarks(force); });
}

function visibleRange() {
  const total = state.children.length;
  if (!total) return { start: 0, end: 0, columns: 1, top: 0, bottom: 0 };
  const columns = state.settings.view === "rows" ? 1 : calculateColumns();
  const rowHeight = (CARD_HEIGHT[state.settings.cardSize] || CARD_HEIGHT.standard) + (parseFloat(getComputedStyle(dom.bookmarks).rowGap) || 0);
  const scrollOffset = Math.max(0, dom.bookmarkPanel.scrollTop);
  const visibleRows = Math.ceil((dom.bookmarkPanel.clientHeight + 700) / Math.max(1, rowHeight));
  const currentRow = Math.floor(scrollOffset / Math.max(1, rowHeight));
  const startRow = Math.max(0, currentRow - 4);
  const endRow = Math.min(Math.ceil(total / columns), startRow + visibleRows);
  return { start: startRow * columns, end: Math.min(total, endRow * columns), columns, top: startRow * rowHeight, bottom: Math.max(0, Math.ceil(total / columns) * rowHeight - endRow * rowHeight) };
}

function renderBookmarks(force = false) {
  updateColumns();
  const range = visibleRange();
  if (!force && state.virtualStart === range.start && state.virtualEnd === range.end && dom.bookmarks.children.length) return;
  dom.bookmarks.replaceChildren();
  if (!state.children.length) {
    const empty = document.createElement("div"); empty.className = "empty-message";
    empty.textContent = state.searchQuery ? "Ничего не найдено." : "В этой папке нет закладок.";
    dom.bookmarks.appendChild(empty); dom.bookmarks.style.paddingBlock = "0";
    state.virtualStart = 0; state.virtualEnd = 0; return;
  }
  const fragment = document.createDocumentFragment();
  for (let i = range.start; i < range.end; i++) { const node = state.children[i]; fragment.appendChild(node.url ? createBookmarkCard(node) : createFolderCard(node)); }
  dom.bookmarks.appendChild(fragment);
  dom.bookmarks.style.paddingBlockStart = range.top ? String(range.top) + "px" : "0";
  dom.bookmarks.style.paddingBlockEnd = range.bottom ? String(range.bottom) + "px" : "0";
  state.virtualStart = range.start; state.virtualEnd = range.end;
}

function createBookmarkCard(bookmark) {
  const card = dom.bookmarkTemplate.content.cloneNode(true).querySelector(".card");
  const link = card.querySelector(".card-link"); const more = card.querySelector(".more");
  const title = getTitle(bookmark); const url = typeof bookmark.url === "string" ? bookmark.url.trim() : "";
  const host = getHostname(url);
  card.dataset.bookmarkId = bookmark.id; card.dataset.itemId = bookmark.id;
  link.href = isValidHttpUrl(url) ? url : "#"; link.target = state.settings.openInNewTab ? "_blank" : "_self";
  if (state.settings.openInNewTab) link.rel = "noopener noreferrer";
  link.querySelector(".card-title").textContent = title;
  link.querySelector(".card-meta").textContent = state.searchQuery ? getFolderPath(state.map, bookmark.parentId, state.bookmarksBarId) : host;
  more.setAttribute("aria-label", "Действия закладки «" + title + "»");
  attachFavicon(link.querySelector(".favicon"), url, host); return card;
}

function createFolderCard(folder) {
  const card = dom.folderTemplate.content.cloneNode(true).querySelector(".card");
  const button = card.querySelector(".folder-link"); const more = card.querySelector(".more");
  const title = getTitle(folder);
  card.dataset.folderId = folder.id; card.dataset.itemId = folder.id;
  button.querySelector(".card-title").textContent = title;
  button.querySelector(".card-meta").textContent = String(folder.children?.length || 0) + " элементов";
  more.setAttribute("aria-label", "Действия папки «" + title + "»");
  if (folder.folderType) more.classList.add("hidden");
  return card;
}

function attachFavicon(container, url, host) {
  container.replaceChildren();
  if (!isValidHttpUrl(url)) { const fallback = document.createElement("span"); fallback.textContent = createFallbackFavicon(url); container.appendChild(fallback); return; }
  const image = document.createElement("img"); image.alt = ""; image.loading = "lazy"; image.decoding = "async";
  try {
    const faviconUrl = new URL(chrome.runtime.getURL("_favicon/"));
    faviconUrl.searchParams.set("pageUrl", url); faviconUrl.searchParams.set("size", "32"); image.src = faviconUrl.toString();
  } catch { container.textContent = createFallbackFavicon(url); return; }
  image.onerror = () => { const fallback = document.createElement("span"); fallback.textContent = createFallbackFavicon(url); container.replaceChildren(fallback); };
  image.title = host || url; container.appendChild(image);
}

function folderTrail(folderId) {
  const result = []; const seen = new Set(); let current = state.map.get(folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id); result.push({ id: current.id, title: current.id === state.bookmarksBarId ? "Главная" : getTitle(current) });
    current = current.parentId ? state.map.get(current.parentId) : null;
  }
  return result.reverse();
}

function renderBreadcrumbs() {
  dom.breadcrumbs.replaceChildren();
  if (state.searchQuery) { const current = document.createElement("span"); current.className = "crumb current"; current.textContent = "Поиск"; dom.breadcrumbs.appendChild(current); return; }
  folderTrail(state.currentFolderId).forEach((entry, index, trail) => {
    if (index) { const separator = document.createElement("span"); separator.textContent = "/"; dom.breadcrumbs.appendChild(separator); }
    if (index === trail.length - 1) { const current = document.createElement("span"); current.className = "crumb current"; current.textContent = entry.title; dom.breadcrumbs.appendChild(current); return; }
    const button = document.createElement("button"); button.className = "crumb"; button.type = "button"; button.textContent = entry.title; button.dataset.folderId = entry.id; dom.breadcrumbs.appendChild(button);
  });
}

function folderDepth(folderId) {
  let depth = 0; let current = state.map.get(folderId); const seen = new Set();
  while (current?.parentId && !seen.has(current.id)) { seen.add(current.id); depth++; current = state.map.get(current.parentId); }
  return Math.max(0, depth - 1);
}

function renderSidebar() {
  dom.folderTree.replaceChildren();

  const addSpecial = (folder, label, icon = "●") => {
    if (!folder) return;
    const row = document.createElement("div");
    row.className = "folder-row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "folder-button";
    button.dataset.folderId = folder.id;
    if (folder.id === state.currentFolderId && !state.searchQuery) {
      button.classList.add("active");
      button.setAttribute("aria-current", "page");
    }
    const iconNode = document.createElement("span");
    iconNode.textContent = icon;
    iconNode.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "folder-name";
    name.textContent = label;
    const count = document.createElement("span");
    count.className = "folder-count";
    count.textContent = String(folder.children?.length || 0);
    button.append(iconNode, name, count);
    row.appendChild(button);
    dom.folderTree.appendChild(row);
  };

  const root = state.map.get(state.rootId);
  const bar = state.map.get(state.bookmarksBarId);
  const other = root?.children?.find(node => node.folderType === "other");
  const mobile = root?.children?.find(node => node.folderType === "mobile");

  addSpecial(bar, "Главная", "★");
  addSpecial(other, "Другие закладки", "●");
  addSpecial(mobile, "Мобильные", "▣");

  const roots = bar?.children?.filter(node => !node.url) || [];

  function addFolder(folder) {
    const row = document.createElement("div"); row.className = "folder-row";
    const button = document.createElement("button"); button.type = "button"; button.className = "folder-button"; button.dataset.folderId = folder.id;
    button.style.paddingLeft = String(10 + Math.min(7, folderDepth(folder.id)) * 14) + "px";
    if (folder.id === state.currentFolderId && !state.searchQuery) {
      button.classList.add("active");
      button.setAttribute("aria-current", "page");
    }
    const icon = document.createElement("span"); icon.textContent = "▰"; icon.setAttribute("aria-hidden", "true");
    const name = document.createElement("span"); name.className = "folder-name"; name.textContent = getTitle(folder);
    const count = document.createElement("span"); count.className = "folder-count"; count.textContent = String(folder.children?.length || 0);
    button.append(icon, name, count); row.appendChild(button);
    const more = document.createElement("button"); more.type = "button"; more.className = "more"; more.dataset.itemId = folder.id; more.setAttribute("aria-haspopup", "menu"); more.setAttribute("aria-expanded", "false");
    more.setAttribute("aria-label", "Действия папки «" + getTitle(folder) + "»"); more.textContent = "⋯"; row.appendChild(more); dom.folderTree.appendChild(row);
    for (const child of folder.children || []) if (!child.url) addFolder(child);
  }
  roots.forEach(addFolder);
  if (!roots.length) { const empty = document.createElement("div"); empty.className = "folder-name"; empty.style.padding = "12px 10px"; empty.style.color = "var(--muted)"; empty.textContent = "Папок пока нет"; dom.folderTree.appendChild(empty); }
  dom.total.textContent = String([...state.map.values()].filter(node => node.url).length);
}

function selectFolder(folderId) {
  if (!state.map.has(folderId)) return;
  state.currentFolderId = folderId; state.searchQuery = ""; dom.search.value = ""; dom.searchClear.classList.add("hidden");
  dom.bookmarkPanel.scrollTop = 0;
  dom.folderTitle.textContent = folderId === state.bookmarksBarId ? "Главная" : getTitle(state.map.get(folderId));
  state.children = getCurrentChildren(); state.virtualStart = 0; state.virtualEnd = 0;
  renderBreadcrumbs(); renderSidebar(); scheduleRender(true);
}

function showSearch(query) {
  state.searchQuery = query.trim(); dom.search.value = query; dom.searchClear.classList.toggle("hidden", !state.searchQuery);
  dom.bookmarkPanel.scrollTop = 0;
  dom.folderTitle.textContent = state.searchQuery ? "Поиск" : (state.currentFolderId === state.bookmarksBarId ? "Главная" : getTitle(state.map.get(state.currentFolderId)));
  state.children = getCurrentChildren(); state.virtualStart = 0; state.virtualEnd = 0; renderBreadcrumbs(); renderSidebar(); scheduleRender(true);
}

function showSettings(show) {
  dom.settingsPanel.classList.toggle("hidden", !show); dom.bookmarkPanel.classList.toggle("hidden", show);
  dom.settingsButton.setAttribute("aria-pressed", String(show));
  if (show) {
    dom.folderTitle.textContent = "Настройки";
    dom.breadcrumbs.replaceChildren();
  } else {
    dom.folderTitle.textContent = state.searchQuery ? "Поиск" : (state.currentFolderId === state.bookmarksBarId ? "Главная" : getTitle(state.map.get(state.currentFolderId)));
    renderBreadcrumbs();
    updateColumns();
    state.virtualStart = 0; state.virtualEnd = 0;
    scheduleRender(true);
  }
}

async function persistSettings() {
  state.settings = await saveSettings(state.settings); applyTheme(); applyVisualSettings();
  state.children = getCurrentChildren(); state.virtualStart = 0; state.virtualEnd = 0; scheduleRender(true);
}

function openInputDialog({ title, label, value = "", type = "text", validate }) {
  return new Promise(resolve => {
    state.dialogResolver = resolve; state.dialogValidate = validate;
    dom.dialogTitle.textContent = title; dom.dialogMessage.textContent = ""; dom.dialogField.classList.remove("hidden");
    dom.dialogLabel.textContent = label; dom.dialogInput.type = type; dom.dialogInput.value = value; dom.dialogError.classList.add("hidden");
    dom.dialogSubmit.textContent = "Сохранить"; dom.dialogSubmit.classList.remove("danger"); dom.dialog.classList.remove("hidden");
    requestAnimationFrame(() => { dom.dialogInput.focus(); dom.dialogInput.select(); });
  });
}

function openConfirmDialog({ title, message, confirmLabel = "Удалить" }) {
  return new Promise(resolve => {
    state.dialogResolver = resolve; state.dialogValidate = null; dom.dialogTitle.textContent = title; dom.dialogMessage.textContent = message;
    dom.dialogField.classList.add("hidden"); dom.dialogError.classList.add("hidden"); dom.dialogSubmit.textContent = confirmLabel; dom.dialogSubmit.classList.add("danger");
    dom.dialog.classList.remove("hidden"); requestAnimationFrame(() => dom.dialogSubmit.focus());
  });
}

function closeDialog(result = null) {
  const resolver = state.dialogResolver;
  const returnFocus = state.dialogReturnFocus;
  state.dialogResolver = null; state.dialogValidate = null; state.dialogReturnFocus = null;
  dom.dialog.classList.add("hidden");
  resolver?.(result);
  if (returnFocus && returnFocus.isConnected) requestAnimationFrame(() => returnFocus.focus());
}

function getMoveFolders(sourceId) {
  const source = state.map.get(sourceId); const q = dom.moveSearch.value.trim().toLocaleLowerCase();
  return [...state.map.values()]
    .filter(node => !node.url && node.parentId)
    .filter(folder => source && folder.id !== source.id && folder.id !== source.parentId && (source.url || !isDescendantOrSelf(state.map, folder.id, source.id)))
    .filter(folder => { const path = getFolderPath(state.map, folder.id, state.bookmarksBarId).toLocaleLowerCase(); return !q || getTitle(folder).toLocaleLowerCase().includes(q) || path.includes(q); })
    .sort((a, b) => getFolderPath(state.map, a.id, state.bookmarksBarId).localeCompare(getFolderPath(state.map, b.id, state.bookmarksBarId), undefined, { sensitivity: "base", numeric: true }));
}

function renderMoveFolders() {
  dom.moveList.replaceChildren(); const folders = getMoveFolders(state.moveSourceId);
  for (const folder of folders) {
    const button = document.createElement("button"); button.type = "button"; button.className = "move-option"; button.dataset.folderId = folder.id;
    button.style.paddingLeft = String(10 + folderDepth(folder.id) * 16) + "px"; button.textContent = getTitle(folder);
    if (folder.id === state.moveDestinationId) {
      button.classList.add("selected");
      button.setAttribute("aria-selected", "true");
    } else {
      button.setAttribute("aria-selected", "false");
    }
    button.setAttribute("role", "option");
    dom.moveList.appendChild(button);
  }
  if (!folders.length) { const empty = document.createElement("div"); empty.className = "empty-message"; empty.textContent = "Подходящих папок нет."; dom.moveList.appendChild(empty); }
  dom.moveSubmit.disabled = !state.moveDestinationId;
}

function openMoveDialog(sourceId) {
  const source = state.map.get(sourceId); if (!source) return;
  state.dialogReturnFocus ||= document.activeElement;
  state.moveSourceId = sourceId;
  state.moveDestinationId = null;
  dom.moveItem.textContent = getTitle(source);
  dom.moveSearch.value = "";
  renderMoveFolders(); dom.moveDialog.classList.remove("hidden"); requestAnimationFrame(() => dom.moveSearch.focus());
}

function closeMoveDialog() {
  const returnFocus = state.dialogReturnFocus;
  dom.moveDialog.classList.add("hidden");
  state.moveSourceId = null; state.moveDestinationId = null; state.dialogReturnFocus = null;
  if (returnFocus && returnFocus.isConnected) requestAnimationFrame(() => returnFocus.focus());
}

async function executeAction(action) {
  const id = state.menuTargetId;
  const node = state.map.get(id);
  state.dialogReturnFocus = state.menuTrigger?.isConnected ? state.menuTrigger : null;
  closeMenu();
  if (!node) return;
  try {
    if (action === "rename") {
      const value = await openInputDialog({ title: "Переименовать", label: "Название", value: getTitle(node), validate: v => v.trim() ? "" : "Название не может быть пустым." });
      if (value !== null) await chrome.bookmarks.update(id, { title: value.trim() });
    }
    if (action === "edit" && node.url) {
      const value = await openInputDialog({ title: "Изменить URL", label: "Адрес", value: node.url, type: "url", validate: v => isValidHttpUrl(v) ? "" : "Нужен корректный URL http или https." });
      if (value !== null) await chrome.bookmarks.update(id, { url: value.trim() });
    }
    if (action === "move") { openMoveDialog(id); return; }
    if (action === "delete") {
      const message = node.url ? "Удалить эту закладку?" : node.children?.length ? "Удалить папку и все элементы внутри неё?" : "Удалить эту папку?";
      const confirmed = await openConfirmDialog({ title: node.url ? "Удалить закладку?" : "Удалить папку?", message });
      if (confirmed) node.url ? await chrome.bookmarks.remove(id) : await chrome.bookmarks.removeTree(id);
    }
  } catch (error) { console.error("Bookmark action failed:", error); }
}

function openMenu(card, x, y, trigger = null) {
  const id = card?.dataset?.itemId || card?.dataset?.folderId; if (!id || !state.map.has(id)) return;
  state.menuTargetId = id; state.menuTrigger = trigger; if (trigger) trigger.setAttribute("aria-expanded", "true");
  const node = state.map.get(id); dom.menu.querySelector('[data-action="edit"]').classList.toggle("hidden", !node.url);
  dom.menu.classList.remove("hidden");
  requestAnimationFrame(() => dom.menu.querySelector("button:not(.hidden)")?.focus());
  const rect = dom.menu.getBoundingClientRect(); const margin = 8;
  dom.menu.style.left = String(Math.max(margin, Math.min(Number(x) || margin, innerWidth - rect.width - margin))) + "px";
  dom.menu.style.top = String(Math.max(margin, Math.min(Number(y) || margin, innerHeight - rect.height - margin))) + "px";
}

function closeMenu() { dom.menu.classList.add("hidden"); state.menuTrigger?.setAttribute("aria-expanded", "false"); state.menuTargetId = null; state.menuTrigger = null; }

function addToParent(parentId, node, index = Infinity) {
  const parent = state.map.get(parentId); if (!parent) return; parent.children ||= [];
  const existing = parent.children.findIndex(child => child.id === node.id); if (existing >= 0) parent.children.splice(existing, 1);
  const target = Math.max(0, Math.min(Number.isFinite(Number(index)) ? Number(index) : parent.children.length, parent.children.length));
  node.parentId = parentId; node.index = target; parent.children.splice(target, 0, node);
  parent.children.forEach((child, i) => { child.index = i; child.parentId = parent.id; });
}

function removeFromParent(node) {
  const parent = node?.parentId ? state.map.get(node.parentId) : null; if (!parent?.children) return;
  parent.children = parent.children.filter(child => child.id !== node.id); parent.children.forEach((child, i) => { child.index = i; });
}

function removeFromMap(id) {
  const node = state.map.get(id); if (!node) return; for (const child of node.children || []) removeFromMap(child.id); state.map.delete(id);
}

function rerenderAfterDataChange() {
  if (state.currentFolderId && !state.map.has(state.currentFolderId)) state.currentFolderId = state.bookmarksBarId;
  renderSidebar(); state.children = getCurrentChildren(); state.virtualStart = 0; state.virtualEnd = 0;
  dom.folderTitle.textContent = state.searchQuery ? "Поиск" : state.currentFolderId === state.bookmarksBarId ? "Главная" : getTitle(state.map.get(state.currentFolderId));
  renderBreadcrumbs(); scheduleRender(true);
}

function applyBookmarkEvent(message) {
  const { type, data } = message || {};
  if (type === "BOOKMARKS_REFRESH") { scheduleRefresh(); return; }
  if (!data) return;
  if (type === "BOOKMARK_CREATED") { state.map.set(data.id, data.node); addToParent(data.node.parentId, data.node, data.node.index); }
  if (type === "BOOKMARK_CHANGED") { const node = state.map.get(data.id); if (node) Object.assign(node, data.changes); }
  if (type === "BOOKMARK_REMOVED") { const node = state.map.get(data.id); if (node) { removeFromParent(node); removeFromMap(data.id); } }
  if (type === "BOOKMARK_MOVED") { const node = state.map.get(data.id); if (node) { removeFromParent(node); addToParent(data.moveInfo?.parentId, node, data.moveInfo?.index); } }
  if (type === "BOOKMARKS_REORDERED") {
    const folder = state.map.get(data.folderId);
    if (folder?.children && Array.isArray(data.childIds)) { const byId = new Map(folder.children.map(child => [child.id, child])); folder.children = data.childIds.map(id => byId.get(id)).filter(Boolean); folder.children.forEach((child, i) => { child.index = i; child.parentId = folder.id; }); }
  }
  rerenderAfterDataChange();
}

async function refresh() {
  if (state.destroyed) return;
  if (state.refreshInFlight) return state.refreshInFlight;
  state.refreshInFlight = (async () => {
    const response = await chrome.runtime.sendMessage({ type: "LOAD_BOOKMARKS" });
    if (!response?.success) throw new Error(response?.error || "Не удалось загрузить закладки");
    const previousFolder = state.currentFolderId; const previousSearch = state.searchQuery;
    state.map = buildMap(response.data.tree[0]); state.rootId = response.data.tree[0].id; state.bookmarksBarId = response.data.bookmarksBarId;
    state.currentFolderId = previousFolder && state.map.has(previousFolder) ? previousFolder : state.bookmarksBarId;
    renderSidebar();
    state.searchQuery = previousSearch || ""; dom.search.value = state.searchQuery; dom.searchClear.classList.toggle("hidden", !state.searchQuery);
    state.children = getCurrentChildren();
    dom.folderTitle.textContent = state.searchQuery ? "Поиск" : state.currentFolderId === state.bookmarksBarId ? "Главная" : getTitle(state.map.get(state.currentFolderId));
    renderBreadcrumbs(); updateColumns(); renderBookmarks(true);
  })().catch(error => {
    console.error(error); dom.bookmarks.replaceChildren(); const empty = document.createElement("div"); empty.className = "empty-message"; empty.textContent = "Не удалось загрузить закладки. Обновите вкладку."; dom.bookmarks.appendChild(empty);
  }).finally(() => { state.refreshInFlight = null; });
  return state.refreshInFlight;
}

function scheduleRefresh() { clearTimeout(state.refreshTimer); state.refreshTimer = setTimeout(() => void refresh(), 120); }

function setupEvents() {
  dom.folderTree.addEventListener("click", event => {
    const more = event.target.closest(".more");
    if (more) { event.preventDefault(); event.stopPropagation(); const row = more.closest(".folder-row"); openMenu({ dataset: { itemId: row?.querySelector("[data-item-id]")?.dataset.itemId || more.dataset.itemId } }, more.getBoundingClientRect().left, more.getBoundingClientRect().bottom + 4, more); return; }
    const button = event.target.closest(".folder-button"); if (button) selectFolder(button.dataset.folderId);
  });

  dom.bookmarks.addEventListener("click", event => {
    const more = event.target.closest(".more");
    if (more) { event.preventDefault(); event.stopPropagation(); const card = more.closest(".card"); const rect = more.getBoundingClientRect(); openMenu(card, rect.left, rect.bottom + 4, more); return; }
    const folderButton = event.target.closest(".folder-link"); if (folderButton) selectFolder(folderButton.closest(".folder-card")?.dataset.folderId);
  });

  const contextMenu = event => {
    const card = event.target.closest(".card, .folder-row"); if (!card) return;
    const id = card.dataset?.itemId || card.dataset?.folderId || card.querySelector("[data-item-id]")?.dataset.itemId; if (!id) return;
    event.preventDefault(); openMenu({ dataset: { itemId: id } }, event.clientX, event.clientY);
  };
  dom.bookmarks.addEventListener("contextmenu", contextMenu); dom.folderTree.addEventListener("contextmenu", contextMenu);
  dom.menu.addEventListener("click", event => { const action = event.target.closest("[data-action]")?.dataset.action; if (action) void executeAction(action); });

  document.addEventListener("click", event => {
    if (!event.target.closest("#menu") && !event.target.closest(".more")) closeMenu();
    const button = event.target.closest("[data-setting] button");
    if (button) { const key = button.closest("[data-setting]")?.dataset.setting; let value = button.dataset.value; if (key === "columns" && value !== "auto") value = Number(value); if (key) { state.settings[key] = value; void persistSettings(); } }
  });

  dom.search.addEventListener("input", event => showSearch(event.target.value));
  dom.searchClear.addEventListener("click", () => { showSearch(""); dom.search.focus(); });
  dom.settingsButton.addEventListener("click", () => showSettings(dom.settingsPanel.classList.contains("hidden")));
  dom.themeButton.addEventListener("click", () => { state.settings.theme = state.settings.theme === "dark" ? "light" : "dark"; void persistSettings(); });
  dom.managerButton.addEventListener("click", () => void chrome.tabs.create({ url: "chrome://bookmarks" }).catch(console.error));
  dom.ambientToggle.addEventListener("change", e => { state.settings.ambient = e.target.checked; void persistSettings(); });
  dom.opacity.addEventListener("input", e => { state.settings.surfaceOpacity = clampOpacity(e.target.value); applyVisualSettings(); clearTimeout(state.settingsSaveTimer); state.settingsSaveTimer = setTimeout(() => void saveSettings(state.settings), 120); });
  dom.backgroundColor.addEventListener("input", e => { state.settings.backgroundColor = e.target.value; applyVisualSettings(); clearTimeout(state.settingsSaveTimer); state.settingsSaveTimer = setTimeout(() => void saveSettings(state.settings), 120); });
  dom.resetBackground.addEventListener("click", () => { state.settings.backgroundColor = null; state.settings.surfaceOpacity = DEFAULT_SETTINGS.surfaceOpacity; void persistSettings(); });
  dom.newtabToggle.addEventListener("change", e => { state.settings.openInNewTab = e.target.checked; void persistSettings(); });
  dom.breadcrumbs.addEventListener("click", e => { const button = e.target.closest("[data-folder-id]"); if (button) selectFolder(button.dataset.folderId); });
  dom.dialogCancel.addEventListener("click", () => closeDialog(null));
  dom.dialog.addEventListener("click", event => { if (event.target === dom.dialog) closeDialog(null); });
  dom.moveDialog.addEventListener("click", event => { if (event.target === dom.moveDialog) closeMoveDialog(); });
  dom.dialogSubmit.addEventListener("click", () => {
    if (!state.dialogResolver) return;
    if (state.dialogValidate) { const error = state.dialogValidate(dom.dialogInput.value); if (error) { dom.dialogError.textContent = error; dom.dialogError.classList.remove("hidden"); dom.dialogInput.focus(); return; } closeDialog(dom.dialogInput.value); }
    else closeDialog(true);
  });
  dom.moveCancel.addEventListener("click", closeMoveDialog); dom.moveSearch.addEventListener("input", renderMoveFolders);
  dom.moveList.setAttribute("aria-label", "Доступные папки");
  dom.moveList.addEventListener("click", e => { const button = e.target.closest("[data-folder-id]"); if (button) { state.moveDestinationId = button.dataset.folderId; renderMoveFolders(); } });
  dom.moveSubmit.addEventListener("click", async () => { if (!state.moveSourceId || !state.moveDestinationId) return; try { await chrome.bookmarks.move(state.moveSourceId, { parentId: state.moveDestinationId }); closeMoveDialog(); } catch (error) { console.error("Move failed:", error); } });
  document.addEventListener("keydown", event => {
    if (!dom.menu.classList.contains("hidden")) { if (event.key === "Escape") { event.preventDefault(); closeMenu(); return; }
      const items = [...dom.menu.querySelectorAll("button:not(.hidden)")]; const index = items.indexOf(document.activeElement);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const next = event.key === "ArrowDown" ? 1 : -1; items[(index + next + items.length) % items.length]?.focus(); return; } }
    if (!dom.dialog.classList.contains("hidden")) { if (event.key === "Escape") { event.preventDefault(); closeDialog(null); } else if (event.key === "Enter" && event.target === dom.dialogInput) { event.preventDefault(); dom.dialogSubmit.click(); } }
    if (!dom.moveDialog.classList.contains("hidden") && event.key === "Escape") { event.preventDefault(); closeMoveDialog(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); dom.search.focus(); dom.search.select(); }
  });
  dom.bookmarkPanel.addEventListener("scroll", () => scheduleRender(), { passive: true });
  window.addEventListener("resize", () => { updateColumns(); scheduleRender(true); }, { passive: true });
  window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", () => {
    if (!state.settings.backgroundColor && state.settings.theme === "system") applyVisualSettings();
  });
  chrome.runtime.onMessage.addListener(message => { if (!state.destroyed && message?.type?.startsWith("BOOKMARK")) applyBookmarkEvent(message); });
}

async function init() { state.settings = await loadSettings(); applyTheme(); applyVisualSettings(); setupEvents(); await refresh(); }
window.addEventListener("beforeunload", () => { state.destroyed = true; clearTimeout(state.refreshTimer); clearTimeout(state.settingsSaveTimer); if (state.renderFrame) cancelAnimationFrame(state.renderFrame); });
void init().catch(error => console.error("Chrome Page init failed:", error));