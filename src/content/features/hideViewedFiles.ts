// Feature (part of the Layout group): open a pull request's "Files changed"
// page with viewed files already filtered out, as if "Viewed files" had been
// unticked in GitHub's own file filter.
//
// GitHub keeps that filter in the URL (`?show-viewed-files=false`, and `=true`
// once ticked back on), so a URL without the parameter is a page left at
// GitHub's default; only those are switched. Whatever the user picks in the
// filter afterwards lands in the URL and is left alone.
//
// The filter is applied through GitHub's own control rather than by rewriting
// the URL, which the React page only reads on a full load:
// - React page (`/pull/N/changes`): open the "Filter options" menu and click
//   its "Viewed files" item. The menu is kept invisible while that happens
//   (see content.css), so nothing flashes.
// - Classic page (`/pull/N/files`): untick the `.js-viewed-files-toggle`
//   checkbox and fire the change event its filter listens for.

import { Settings } from '../../shared/settings';

const PARAM = 'show-viewed-files';
/** On <html> while the filter menu is driven, so it stays invisible. */
const BUSY_ATTR = 'data-ghe-hiding-viewed';

/** Path we already switched (or tried to), so each page visit is handled once. */
let handledPath: string | null = null;
let busy = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isFilesPage(): boolean {
  return /^\/[^/]+\/[^/]+\/pull\/\d+\/(files|changes)(\/|$)/.test(location.pathname);
}

/** The React page's "Filter options" icon button (labelled by a tooltip). */
function findFilterButton(): HTMLButtonElement | null {
  for (const btn of document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="true"]')) {
    const id = btn.getAttribute('aria-labelledby');
    const label = id ? document.getElementById(id)?.textContent?.trim() : '';
    if (label === 'Filter options') return btn;
  }
  return null;
}

function findViewedItem(): HTMLElement | null {
  for (const item of document.querySelectorAll<HTMLElement>(
    '[role="menu"] [role="menuitemcheckbox"]',
  )) {
    if (item.textContent?.trim() === 'Viewed files') return item;
  }
  return null;
}

async function untickInMenu(button: HTMLButtonElement): Promise<void> {
  const root = document.documentElement;
  root.setAttribute(BUSY_ATTR, '');
  try {
    button.click();
    let item: HTMLElement | null = null;
    for (let i = 0; i < 40 && !item; i++) {
      await sleep(25);
      item = findViewedItem();
    }
    if (item?.getAttribute('aria-checked') === 'true') {
      // Clicking the item applies the filter and closes the menu.
      item.click();
    } else if (document.querySelector('[role="menu"]')) {
      button.click();
    }
    // The menu hands focus back to its button; don't leave a focus ring there.
    if (document.activeElement === button) button.blur();
  } finally {
    root.removeAttribute(BUSY_ATTR);
  }
}

function untickClassic(input: HTMLInputElement): void {
  input.checked = false;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export function applyHideViewedFiles(settings: Settings): void {
  if (!settings.layout.hideViewedFiles || !isFilesPage()) {
    handledPath = null;
    return;
  }
  const path = location.pathname;
  if (busy || handledPath === path) return;
  if (new URLSearchParams(location.search).has(PARAM)) {
    handledPath = path;
    return;
  }

  const classic = document.querySelector<HTMLInputElement>('input.js-viewed-files-toggle');
  if (classic) {
    handledPath = path;
    if (classic.checked) untickClassic(classic);
    return;
  }

  // Not rendered yet: a later pass (on the next DOM mutation) tries again.
  const button = findFilterButton();
  if (!button) return;
  handledPath = path;
  busy = true;
  untickInMenu(button)
    .catch(() => {})
    .finally(() => {
      busy = false;
    });
}
