import { createFallbackFavicon, isValidHttpUrl } from "./bookmarks-utils.js";

function fallbackLetter(title, url) {
  const source = String(title || "").trim();
  return source.match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() || createFallbackFavicon(url).slice(0, 1) || "?";
}

function fallbackHue(host, url) {
  const source = String(host || url || "site");
  let hash = 0;
  for (const char of source) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return hash % 360;
}

function renderFallback(container, title, host, url) {
  const fallback = document.createElement("span");
  fallback.className = "favicon-fallback";
  fallback.textContent = fallbackLetter(title, url);
  fallback.style.setProperty("--favicon-fallback-hue", String(fallbackHue(host, url)));
  fallback.setAttribute("aria-hidden", "true");
  container.replaceChildren(fallback);
}

export function attachFavicon(container, url, host, title = "") {
  container.replaceChildren();

  if (!isValidHttpUrl(url)) {
    renderFallback(container, title, host, url);
    return;
  }

  const image = document.createElement("img");
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";

  try {
    const faviconUrl = new URL(chrome.runtime.getURL("_favicon/"));
    faviconUrl.searchParams.set("pageUrl", url);
    faviconUrl.searchParams.set("size", "32");
    image.src = faviconUrl.toString();
  } catch {
    renderFallback(container, title, host, url);
    return;
  }

  image.onerror = () => renderFallback(container, title, host, url);
  image.title = host || url;
  container.appendChild(image);
}
