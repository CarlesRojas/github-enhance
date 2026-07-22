# Development

## Requirements

- Node 18+

## Build

```bash
npm install     # once
npm run build   # outputs the extension into dist/
```

Useful during development:

```bash
npm run watch   # rebuild on every change
```

## Load in Chrome

1. Run `npm run build` (creates `dist/`).
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select the `dist/` folder.
5. Open any `github.com` page and click the extension icon to configure.

## Apply changes

- **Popup or content-script edits:** re-run `npm run build` (or keep
  `npm run watch` running), then on `chrome://extensions` click the **reload**
  icon on the GitHub Enhance card and refresh the GitHub tab.
- **`manifest.json` edits:** rebuild, then reload the extension card.

## Other scripts

```bash
npm run typecheck   # tsc --noEmit
npm run icons       # regenerate PNG icons in src/icons/
```
