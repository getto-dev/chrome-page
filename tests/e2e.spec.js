import { test, expect, chromium } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const extensionPath = path.resolve(import.meta.dirname, "..");

test("Chrome Page boots and manages bookmark changes", async () => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "chrome-page-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    args: [
      "--disable-extensions-except=" + extensionPath,
      "--load-extension=" + extensionPath
    ]
  });

  let folderId = null;
  let bookmarkId = null;

  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const extensionId = worker.url().split("/")[2];
    const page = await context.newPage();

    await page.goto("chrome-extension://" + extensionId + "/index.html");
    await expect(page.locator("#folder-title")).toHaveText(/Главная|Закладки/);
    await expect(page.locator(".header-status")).toHaveCount(0);
    await expect(page.locator(".folder-count")).toHaveCount(0);
    await expect(page.locator(".sidebar-label")).toHaveCount(0);
    await expect(page.locator('[data-setting="view"]')).toHaveCount(0);

    const node = await worker.evaluate(async () => {
      const tree = await chrome.bookmarks.getTree();
      const bar = tree[0].children.find(item => item.folderType === "bookmarks-bar") ?? tree[0].children[0];
      const folder = await chrome.bookmarks.create({ parentId: bar.id, title: "Chrome Page E2E" });
      const nestedFolder = await chrome.bookmarks.create({ parentId: folder.id, title: "Nested Folder" });
      const bookmark = await chrome.bookmarks.create({
        parentId: folder.id,
        title: "Example",
        url: "https://example.com/"
      });
      return { folderId: folder.id, nestedFolderId: nestedFolder.id, bookmarkId: bookmark.id };
    });

    folderId = node.folderId;
    bookmarkId = node.bookmarkId;

    await expect(page.getByRole("button", { name: "Chrome Page E2E" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nested Folder" })).toHaveCount(0);
    await page.getByRole("button", { name: "Chrome Page E2E" }).click();
    await expect(page.getByRole("link", { name: "Example" })).toHaveAttribute("href", "https://example.com/");

    await page.locator('.bookmark-card[data-bookmark-id="' + bookmarkId + '"] .more').click();
    await expect(page.locator('#menu [data-action="rename"] .icon use')).toHaveAttribute("href", "#icon-edit");
    await expect(page.locator('#menu [data-action="edit"] .icon use')).toHaveAttribute("href", "#icon-link");
    await expect(page.locator('#menu [data-action="move"] .icon use')).toHaveAttribute("href", "#icon-move");
    await expect(page.locator('#menu [data-action="delete"] .icon use')).toHaveAttribute("href", "#icon-trash");
    await page.locator('#menu [data-action="rename"]').click();
    await page.locator("#dialog-input").fill("Example Renamed");
    await page.locator("#dialog-submit").click();
    await expect(page.getByRole("link", { name: "Example Renamed" })).toBeVisible();

    await page.locator("#search").fill("example.com");
    await expect(page.locator('.bookmark-card[data-bookmark-id="' + bookmarkId + '"]')).toHaveCount(1);
    await expect(page.locator('.bookmark-card[data-bookmark-id="' + bookmarkId + '"] .card-meta')).toHaveText("Главная / Chrome Page E2E");
    await expect(page.locator(".folder-card .card-meta")).toHaveCount(0);

    await page.getByRole("button", { name: "Настройки" }).click();
    await expect(page.locator("#settings-panel")).toBeVisible();
    await page.locator('[data-setting="columns"] button[data-value="2"]').click();
    await expect(page.locator("#bookmarks")).toHaveAttribute("data-columns", "2");
    await expect(page.locator("#bookmarks").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(2);

    await page.locator('[data-setting="blur"] button[data-value="soft"]').click();
    await expect(page.locator("html")).toHaveAttribute("data-blur", "soft");
    await expect(page.locator("html").evaluate(el => getComputedStyle(el).getPropertyValue("--blur").trim())).toBe("12px");

    await page.locator("#opacity").fill("65");
    await expect(page.locator("#opacity-value")).toHaveText("65%");
    await expect(page.locator("html").evaluate(el => getComputedStyle(el).getPropertyValue("--alpha").trim())).toBe("0.65");

    await page.locator('[data-setting="cardSize"] button[data-value="large"]').click();
    await expect(page.locator("#bookmarks")).toHaveAttribute("data-size", "large");
    await expect(page.locator("#bookmarks .bookmark-card")).toHaveCSS("height", "84px");

    await page.locator('[data-setting="spacing"] button[data-value="large"]').click();
    await expect(page.locator("#bookmarks")).toHaveAttribute("data-spacing", "large");
    await expect(page.locator("#bookmarks").evaluate(el => getComputedStyle(el).rowGap)).toBe("18px");

    await page.locator('[data-setting="radius"] button[data-value="sharp"]').click();
    await expect(page.locator("#bookmarks")).toHaveAttribute("data-radius", "sharp");
    await expect(page.locator("#bookmarks .bookmark-card")).toHaveCSS("border-radius", "10px");

  } finally {
    const worker = context.serviceWorkers()[0];
    if (worker && bookmarkId) {
      await worker.evaluate(async id => chrome.bookmarks.remove(id).catch(() => {}), bookmarkId);
    }
    if (worker && folderId) {
      await worker.evaluate(async id => chrome.bookmarks.removeTree(id).catch(() => {}), folderId);
    }
    await context.close();
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});
