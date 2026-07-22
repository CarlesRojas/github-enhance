# Publishing

Publish to the Chrome Web Store. (To just share the folder or load it
yourself, see `DEV.md` → *Load in Chrome*.)

## One-time setup

- Register at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
  (one-time $5 USD fee).

## Package

1. Bump `version` in `manifest.json` (and `package.json` to match).
2. Build:
   ```bash
   npm install & npm run build
   ```
3. Zip the **contents** of `dist/` (so `manifest.json` sits at the zip root)
   into `release/`, named with the version:
   ```bash
   VERSION=$(node -p "require('./manifest.json').version")
   mkdir -p release
   cd dist && zip -r "../release/github-enhance-$VERSION.zip" . && cd ..
   ```
   This produces e.g. `release/github-enhance-0.2.0.zip`.

## Submit

1. In the dashboard, click **Add new item** and upload the zip from `release/`.
2. Fill in the listing: description, at least one screenshot, category, and the
   privacy tab — this extension only requests the `storage` permission and runs
   on `github.com` (no remote code, no data collection).
3. Click **Submit for review**. Review typically takes a few hours to a few days.

## Update later

1. Bump `version` again (it must be higher than the published one).
2. Rebuild and re-zip (steps above).
3. Open the item → **Package** → **Upload new package** → **Submit for review**.
