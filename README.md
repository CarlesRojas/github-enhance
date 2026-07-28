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
- **Date format** dropdown (ISO, `Jul 22, 2026`, `07/22/2026`, `22 Jul 2026`,
  weekday variants…).
- **Time format** dropdown (24-hour, 12-hour, with/without seconds, or
  **No time** for date-only).
- **Hide year when current** — omit the year for dates in the current year.
- Live preview in the popup.

The original `<relative-time>` element is only hidden (not destroyed) and a
formatted sibling is shown next to it, so turning the feature off restores the
native behavior instantly — no reload.

### 2. Pull Request Layout (experimental)

Rearrange the PR conversation:

- **Move checks up** — the checks / merge box goes above the timeline on
  mobile, or into the sidebar on desktop (when the sidebar is a column).
  Re-evaluated on resize.
- **Move comment box to top** — the “Add a comment” box above the timeline
  (only your composer, not other people’s / CI comments).
- **Hide guidelines & ProTip** — hide the Community Guidelines reminder and the
  “ProTip!” line.

Moved boxes are lined up with the comment column (their desktop-only left
indent is zeroed), and every moved node leaves a placeholder at its original
spot, so any combination reconciles back — including on resize — without a
reload. The checks box is React-managed, so it *may* snap back if GitHub
re-renders it — hence experimental.

### 3. Pull Request Sidebar

Hide sidebar sections you don’t use on PR/issue pages.

- One independent toggle per section — **Reviewers, Assignees, Labels,
  Projects, Milestone, Development, Notifications, Participants, Lock
  conversation** — all shown by default; turn one off to hide it.
- Sections are matched by known container selectors and heading text, so this
  keeps working when GitHub reorders them. Hiding uses `!important` to beat
  Primer utilities like `.d-block`. Re-enabling a section restores it without a
  reload.
- *Lock conversation* hides just that control, not a neighbouring Pin button.

### 4. Repository Tabs — My Pull Requests

Renames a repository's **Pull requests** tab to **My Pull Requests** and points
it at the same page filtered to your own open PRs
(`/owner/repo/pulls?q=is:pr+is:open+author:@me`).

- The filter uses GitHub's `@me` self-reference, so nothing has to look up (or
  store) your username, and no extra permission is needed.
- The tab keeps its icon, position and Turbo behaviour; the repo-wide open-PR
  counter is hidden, since it no longer describes what the tab opens.
- The tab bar is React-rendered, so every pass re-asserts the change (and
  re-applies it if React resets the link). The original link and label are
  stashed on the anchor, so turning the option off restores them without a
  reload.

### 5. Comments — Hide as outdated

Adds a **Hide** button to the right of every pull-request comment that
minimizes it as *Outdated* in one click — the same result as
`… → Hide → Outdated`.

- It submits the comment’s own minimize form (preserving GitHub’s CSRF token),
  falling back to driving the `…` menu if the form isn’t inline.
- The button never appears on the PR/issue description or already-hidden
  comments.

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
      nav.ts             # feature 4 (repository tab bar)
      timeline.ts        # feature 5
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
