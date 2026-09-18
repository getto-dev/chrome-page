import { createFallbackFavicon, isValidHttpUrl } from "./bookmarks-utils.js";

export function attachFavicon(container, url, host) {
  container.replaceChildren();

  if (!isValidHttpUrl(url)) {
    const fallback = document.createElement("span");
    fallback.textContent = createFallbackFavicon(url);
    container.appendChild(fallback);
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
    container.textContent = createFallbackFavicon(url);
    return;
  }

  image.onerror = () => {
    const fallback = document.createElement("span");
    fallback.textContent = createFallbackFavicon(url);
    container.replaceChildren(fallback);
  };
  image.title = host || url;
  container.appendChild(image);
}
