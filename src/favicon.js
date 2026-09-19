import { createFallbackFavicon, isValidHttpUrl } from "./bookmarks-utils.js";

const MIN_FAVICON_SIZE = 24;
const FAVICON_REQUEST_SIZE = 64;
const faviconSources = new Map();
const faviconSourcePromises = new Map();
const faviconRequestTokens = new WeakMap();
const MAX_FAVICON_CACHE = 512;
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
      faviconUrl.searchParams.set("size", String(FAVICON_REQUEST_SIZE));
      image.src = faviconUrl.toString();
    } catch {
      resolve("");
    }
  });

  return missingFaviconSignaturePromise;
}

function buildFaviconUrl(url) {
  const faviconUrl = new URL(chrome.runtime.getURL("_favicon/"));
  faviconUrl.searchParams.set("pageUrl", url);
  faviconUrl.searchParams.set("size", String(FAVICON_REQUEST_SIZE));
  return faviconUrl.toString();
}

function getCachedFaviconSource(host) {
  if (!host || !faviconSources.has(host)) return "";
  const source = faviconSources.get(host);
  faviconSources.delete(host);
  faviconSources.set(host, source);
  return source;
}

function setCachedFaviconSource(host, source) {
  if (!host || !source) return;
  faviconSources.delete(host);
  faviconSources.set(host, source);
  if (faviconSources.size > MAX_FAVICON_CACHE) {
    faviconSources.delete(faviconSources.keys().next().value);
  }
}

function getFaviconPageUrls(url) {
  const candidates = [];
  try {
    const page = new URL(url);
    if (page.origin && page.origin !== "null") candidates.push(page.origin + "/");
  } catch {}
  candidates.push(url);
  return [...new Set(candidates)];
}

function loadFaviconCandidate(pageUrl) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = async () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!width || !height || width < MIN_FAVICON_SIZE || height < MIN_FAVICON_SIZE) {
        resolve("");
        return;
      }

      const missingSignature = await getMissingFaviconSignature();
      if (missingSignature && getImageSignature(image) === missingSignature) {
        resolve("");
        return;
      }

      resolve(image.src);
    };
    image.onerror = () => resolve("");

    try {
      image.src = buildFaviconUrl(pageUrl);
    } catch {
      resolve("");
    }
  });
}

function loadFaviconSource(host, url) {
  const cached = getCachedFaviconSource(host);
  if (cached) return Promise.resolve(cached);
  if (host && faviconSourcePromises.has(host)) return faviconSourcePromises.get(host);

  const promise = (async () => {
    for (const pageUrl of getFaviconPageUrls(url)) {
      const source = await loadFaviconCandidate(pageUrl);
      if (source) {
        setCachedFaviconSource(host, source);
        return source;
      }
    }
    return "";
  })().finally(() => {
    if (host) faviconSourcePromises.delete(host);
  });

  if (host) faviconSourcePromises.set(host, promise);
  return promise;
}

export async function attachFavicon(container, url, host, title = "") {
  const previousRequest = faviconRequestTokens.get(container);
  if (previousRequest) previousRequest.canceled = true;
  const request = { canceled: false };
  faviconRequestTokens.set(container, request);
  container.replaceChildren();

  if (!isValidHttpUrl(url)) {
    renderFallback(container, title, host, url);
    return;
  }

  const source = await loadFaviconSource(host, url);
  if (request.canceled || faviconRequestTokens.get(container) !== request) return;
  if (!source) {
    renderFallback(container, title, host, url);
    return;
  }

  const image = document.createElement("img");
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  image.title = host || url;
  image.onerror = () => {
    if (host) faviconSources.delete(host);
    if (!request.canceled && faviconRequestTokens.get(container) === request) renderFallback(container, title, host, url);
  };
  image.src = source;
  container.replaceChildren(image);
}
