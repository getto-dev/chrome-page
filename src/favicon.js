import { createFallbackFavicon, isValidHttpUrl } from "./bookmarks-utils.js";

const MIN_FAVICON_SIZE = 24;
const FAVICON_REQUEST_SIZE = 64;
const faviconSources = new Map();
const faviconSourcePromises = new Map();
const faviconControllers = new WeakMap();
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

function loadFaviconSource(host, url) {
  if (host && faviconSources.has(host)) return Promise.resolve(faviconSources.get(host));
  if (host && faviconSourcePromises.has(host)) return faviconSourcePromises.get(host);

  const promise = new Promise(resolve => {
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

      const source = image.src;
      if (host) faviconSources.set(host, source);
      resolve(source);
    };
    image.onerror = () => resolve("");

    try {
      image.src = buildFaviconUrl(url);
    } catch {
      resolve("");
    }
  }).finally(() => {
    if (host) faviconSourcePromises.delete(host);
  });

  if (host) faviconSourcePromises.set(host, promise);
  return promise;
}

export async function attachFavicon(container, url, host, title = "") {
  faviconControllers.get(container)?.abort();
  const controller = new AbortController();
  faviconControllers.set(container, controller);
  container.replaceChildren();

  if (!isValidHttpUrl(url)) {
    renderFallback(container, title, host, url);
    return;
  }

  const source = await loadFaviconSource(host, url);
  if (controller.signal.aborted) return;
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
    if (!controller.signal.aborted) renderFallback(container, title, host, url);
  };
  image.src = source;
  container.replaceChildren(image);
}
