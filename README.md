# Chrome Page

Chrome new-tab bookmark workspace combining the strongest ideas from `getto-dev/home-page` and `getto-dev/chrome`.

## Architecture

- Manifest V3
- Service worker for bookmark caching and delta synchronization
- Vanilla JavaScript, no production dependencies
- Glass / Frosted UI
- Плашки в 1–4 колонки
- Global bookmark search with folder paths
- Bookmark and folder management
- Light / Dark / System themes
- Auto / 2 / 3 / 4 columns for bookmark tiles
- Tile size, spacing, radius, blur and surface opacity settings
- Local SVG icon sprite and native favicon loading with deterministic text fallback
- Virtualized bookmark rendering for large collections

Chrome's Bookmarks API and Storage API are used through the MV3 extension model. The service worker owns cache invalidation and bookmark event broadcasting.

## Development

Requires Node.js 22+.

```bash
npm test
npm run test:e2e
```

## Install locally

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select this repository directory.
5. Open a new tab.

Production runtime has no remote dependencies.
