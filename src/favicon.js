import { createFallbackFavicon, isValidHttpUrl } from "./bookmarks-utils.js";

const MIN_FAVICON_SIZE = 24;
const faviconSources = new Map();
let missingFaviconSignaturePromise = null;

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

function getImageSignature(image) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return "";
    context.clearRect(0, 0, 8, 8);
    context.drawImage(image, 0, 0, 8, 8);

    const pixels = context.getImageData(0, 0, 8, 8).data;
    let hash = 2166136261;
    for (let index = 0; index < pixels.length; index += 4) {
      hash ^= pixels[index] >> 4;
      hash = Math.imul(hash, 16777619);
      hash ^= pixels[index + 1] >> 4;
      hash = Math.imul(hash, 16777619);
      hash ^= pixels[index + 2] >> 4;
      hash = Math.imul(hash, 16777619);
      hash ^= pixels[index + 3] >> 4;
      hash = Math.imul(hash, 16777619);
    }
    return String(hash >>> 0);
  } catch {
    return "";
  }
}

function getMissingFaviconSignature() {
  if (missingFaviconSignaturePromise) return missingFaviconSignaturePromise;

  missingFaviconSignaturePromise = new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(getImageSignature(image));
    image.onerror = () => resolve("");

    try {
      const faviconUrl = new URL(chrome.runtime.getURL("_favicon/"));
      faviconUrl.searchParams.set("pageUrl", "https://chrome-page-favicon-probe.invalid/");
      faviconUrl.searchParams.set("size", "32");
      image.src = faviconUrl.toString();
    } catch {
      resolve("");
    }
  });

  return missingFaviconSignaturePromise;
}

function isMissingFavicon(image, signature) {
  return Boolean(signature && getImageSignature(image) === signature);
}

function buildFaviconUrl(url, sourceUrl = url) {
  const faviconUrl = new URL(chrome.runtime.getURL("_favicon/"));
  faviconUrl.searchParams.set("pageUrl", sourceUrl);
  faviconUrl.searchParams.set("size", "32");
  return faviconUrl.toString();
}

export function attachFavicon(container, url, host, title = "") {
  container.replaceChildren();

  if (!isValidHttpUrl(url)) {
    renderFallback(container, title, host, url);
    return;
  }

  const cachedSource = host ? faviconSources.get(host) : "";
  const image = document.createElement("img");
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";

  image.onerror = () => {
    if (host) faviconSources.delete(host);
    renderFallback(container, title, host, url);
  };

  image.onload = async () => {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height || width < MIN_FAVICON_SIZE || height < MIN_FAVICON_SIZE) {
      if (host) faviconSources.delete(host);
      renderFallback(container, title, host, url);
      return;
    }

    const missingSignature = await getMissingFaviconSignature();
    if (isMissingFavicon(image, missingSignature)) {
      if (host) faviconSources.delete(host);
      renderFallback(container, title, host, url);
      return;
    }

    if (host && !faviconSources.has(host)) faviconSources.set(host, image.src);
  };

  try {
    image.src = cachedSource || buildFaviconUrl(url);
  } catch {
    renderFallback(container, title, host, url);
    return;
  }

  image.title = host || url;
  container.appendChild(image);
}
