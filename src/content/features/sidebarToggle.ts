// Feature (part of the Layout group): a round button pinned to the bottom
// right of the PR conversation that collapses the sidebar, so the page shows
// only the description, the comments and the timeline at full width. It is
// always visible while the sidebar is a right-hand column, showing GitHub's
// own sidebar-collapse / sidebar-expand octicon; the back-to-top button sits
// to its left (see content.css).
//
// Collapsing is pure CSS keyed off an attribute on <html> (see content.css):
// the pane is squeezed to zero width rather than removed, so GitHub's React
// never sees a node of its own touched. The button lives on <body>, outside
// every React root, like the back-to-top one. The collapsed state is
// remembered across pages in chrome.storage.local (a per-machine view
// preference, not a synced setting).
//
// Only offered while the sidebar is a right-hand column: once it stacks below
// the content on narrow windows, collapsing it would save no width, so the
// sidebar is shown in full until the window widens again.

import { Settings } from '../../shared/settings';
import { isPRPage } from '../util';

const ID = 'ghe-sidebar-toggle';
const ATTR = 'data-ghe-sidebar-collapsed';
/** On <html> while the button is shown, so the back-to-top one moves left. */
const SHOWN_ATTR = 'data-ghe-sidebar-toggle';
const STORAGE_KEY = 'sidebarCollapsed';

let collapsed = false;
let loaded = false;
let onChange: () => void = () => {};

const svg = (paths: string): string =>
  `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">${paths}</svg>`;
/** Octicon sidebar-collapse-16: right-hand panel, arrow pointing into it. */
const ICON_COLLAPSE = svg(
  '<path d="M6.823 7.823a.25.25 0 0 1 0 .354l-2.396 2.396A.25.25 0 0 1 4 10.396V5.604a.25.25 0 0 1 .427-.177Z"></path>' +
    '<path d="M1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25V1.75C0 .784.784 0 1.75 0ZM1.5 1.75v12.5c0 .138.112.25.25.25H9.5v-13H1.75a.25.25 0 0 0-.25.25ZM11 14.5h3.25a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25H11Z"></path>',
);
/** Octicon sidebar-expand-16: right-hand panel, arrow pointing out of it. */
const ICON_EXPAND = svg(
  '<path d="m4.177 7.823 2.396-2.396A.25.25 0 0 1 7 5.604v4.792a.25.25 0 0 1-.427.177L4.177 8.177a.25.25 0 0 1 0-.354Z"></path>' +
    '<path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25H9.5v-13Zm12.5 13a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25H11v13Z"></path>',
);

/** Called after the user toggles, so the content script can re-run a pass. */
export function setSidebarToggleListener(fn: () => void): void {
  onChange = fn;
}

/** True while the sidebar is currently collapsed on the page. */
export function isSidebarCollapsed(): boolean {
  return document.documentElement.hasAttribute(ATTR);
}

/** Read the remembered state once; the first pass runs before it resolves. */
function load(): void {
  if (loaded) return;
  loaded = true;
  chrome.storage.local
    .get(STORAGE_KEY)
    .then((data) => {
      if (data[STORAGE_KEY] === true && !collapsed) {
        collapsed = true;
        onChange();
      }
    })
    .catch(() => {});
}

/** The pane holding the PR conversation sidebar (React and classic layouts). */
function findPane(): HTMLElement | null {
  const sidebar = document.querySelector<HTMLElement>('#partial-discussion-sidebar');
  return (
    sidebar?.closest<HTMLElement>('[class*="prc-PageLayout-PaneWrapper"], .Layout-sidebar') ??
    null
  );
}

/**
 * Whether the sidebar is a right-hand column. Judged by height, not width, so
 * it holds while collapsed (the pane is then zero wide but still sits beside
 * the main column): a column starts above the main column's bottom, a stacked
 * sidebar below it.
 */
function sidebarIsColumn(pane: HTMLElement): boolean {
  const main =
    document.querySelector<HTMLElement>('[class*="prc-PageLayout-ContentWrapper"]') ||
    document.querySelector<HTMLElement>('.Layout-main');
  if (!main) return false;
  const mr = main.getBoundingClientRect();
  if (mr.height === 0) return false;
  return pane.getBoundingClientRect().top < mr.bottom - 1;
}

function render(btn: HTMLButtonElement): void {
  const label = collapsed ? 'Show sidebar' : 'Hide sidebar';
  if (btn.title === label) return;
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.innerHTML = collapsed ? ICON_EXPAND : ICON_COLLAPSE;
}

function ensureButton(): HTMLButtonElement {
  let btn = document.getElementById(ID) as HTMLButtonElement | null;
  if (!btn) {
    btn = document.createElement('button');
    btn.id = ID;
    btn.type = 'button';
    btn.addEventListener('click', () => {
      collapsed = !collapsed;
      chrome.storage.local.set({ [STORAGE_KEY]: collapsed }).catch(() => {});
      onChange();
    });
    document.body.appendChild(btn);
  }
  render(btn);
  return btn;
}

function remove(): void {
  const root = document.documentElement;
  root.removeAttribute(ATTR);
  root.removeAttribute(SHOWN_ATTR);
  document.getElementById(ID)?.remove();
}

export function applySidebarToggle(settings: Settings): void {
  const pane = settings.layout.sidebarToggle && isPRPage() ? findPane() : null;
  if (!pane || !sidebarIsColumn(pane)) {
    remove();
    return;
  }
  load();
  ensureButton();
  document.documentElement.setAttribute(SHOWN_ATTR, '');
  document.documentElement.toggleAttribute(ATTR, collapsed);
}
