# GitHub Enhance

A Chrome extension (Manifest V3) that visually enhances GitHub. Click the
toolbar icon to open a popup where every feature can be toggled off completely
or configured.

The popup is built with **React**; the on-page changes are applied by a
**content script**. Everything is bundled with **esbuild** — no framework CLI
or heavy toolchain.

## Features

Each feature has its own group in the popup, with a small title and a row per
setting.

### 1. Dates

Replaces relative dates everywhere GitHub shows them (“yesterday”, “last
week”, …) with an absolute date & time.

- **Toggle** to turn the feature on/off.
- **Format** presets (ISO, US, EU, long, date-only) plus a **Custom** pattern.
  - Tokens: `YYYY YY MM M DD D HH H hh h mm m ss s`, month names `MMM/MMMM`,
    weekday `ddd/dddd`, `A`/`a` for AM/PM. Wrap literal text in `[brackets]`,
    e.g. `YYYY-MM-DD [at] HH:mm`.
- Live preview in the popup.

The original `<relative-time>` element is only hidden (not destroyed) and a
formatted sibling is shown next to it, so turning the feature off restores the
native behavior instantly — no reload.

### 2. Pull Request Sidebar

Hide sidebar sections you don’t use on PR/issue pages.

- A master toggle for the feature, then a per-section toggle for **Reviewers,
  Assignees, Labels, Projects, Milestone, Development, Notifications,
  Participants**.
- Sections are matched by their heading text, so this keeps working when GitHub
  reorders them. Re-enabling a section restores it without a reload.

### 3. Comments — Hide as outdated

Adds a **Hide** button to the right of every pull-request comment that
minimizes it as *Outdated* in one click — the same result as
`… → Hide → Outdated`.

- It submits the comment’s own minimize form (preserving GitHub’s CSRF token),
  falling back to driving the `…` menu if the form isn’t inline.
- The button never appears on the PR/issue description or already-hidden
  comments.

### 4. Timeline — reverse order (experimental)

Reorders the PR conversation to read newest-first:

1. **Description** stays at the top (its own section).
2. **Checks / merge box** moves down.
3. **Add a comment** box.
4. The rest of the **timeline, reversed** (newest first).

Every moved node leaves a placeholder at its original spot, so turning the
feature off puts the page back. It’s marked experimental because it depends on
GitHub’s conversation layout; if a page ever looks off, turn it off and reload.

## Build

Requires Node 18+.

```bash
npm install
npm run build      # outputs the loadable extension into dist/
```

Other scripts:

```bash
npm run watch      # rebuild on change
npm run typecheck  # tsc --noEmit
npm run icons      # regenerate the PNG icons in src/icons/
```

## Load it in Chrome

1. `npm run build`
2. Go to `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `dist/` folder.
5. Open any page on `github.com` and click the extension icon to configure.

Settings are stored in `chrome.storage.sync`, so they persist and follow your
Chrome profile. Changes apply live to open GitHub tabs.

## Project layout

```
manifest.json            # MV3 manifest (copied into dist/)
build.mjs                # esbuild build (popup + content + css + static)
scripts/make-icons.mjs   # dependency-free PNG icon generator
src/
  shared/
    settings.ts          # settings schema, defaults, storage helpers
    formatDate.ts        # token-based date formatter
  content/
    content.ts           # orchestrator: apply on load/mutation/nav/settings
    content.css          # styles for injected elements
    util.ts              # waitFor, text helpers
    features/
      dates.ts           # feature 1
      sidebar.ts         # feature 2
      hideComments.ts    # feature 3
      timeline.ts        # feature 4
  popup/
    popup.html
    popup.tsx            # React app
    components.tsx       # Group / Row / Toggle / Select / TextField
    popup.css            # popup styling (light + dark)
  icons/                 # generated PNGs
```

## Notes

- The content script targets the classic PR/issue conversation markup
  (`relative-time`, `.discussion-sidebar-item`, `.timeline-comment`,
  `.js-discussion`). Features fail safe: if the expected structure isn’t found
  they no-op rather than break the page.
- Only two permissions are requested: `storage` and host access to
  `https://github.com/*`.
