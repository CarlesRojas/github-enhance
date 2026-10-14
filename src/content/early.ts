// The part of every feature that can be decided before GitHub's page exists:
// the attributes and CSS variables on <html> that content.css keys off, and a
// stylesheet hiding the repository tabs that are switched off.
//
// content.css is injected before the page paints, but the main content script
// runs at document_idle — so without this, GitHub's own layout shows for a
// moment before ours replaces it. boot.ts applies this at document_start from
// a synchronous copy of the settings kept in the page's localStorage; the main
// script keeps that copy current and re-applies on every settings change.
// Anything that needs the page itself (moving the checks box, measuring the
// sidebar) is still settled by the regular passes afterwards.

import { PAGE_WIDTH_DEFAULT, Settings, mergeSettings } from '../shared/settings';
import { isPRPage } from './util';

const SETTINGS_CACHE = 'ghe-settings';
const COLLAPSED_CACHE = 'ghe-sidebar-collapsed';
const STYLE_ID = 'ghe-early-style';
/** Primer's lg breakpoint, where the PR sidebar becomes a column. */
const COLUMN_MIN_WIDTH = 1012;

export function readCachedSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE);
    return raw ? mergeSettings(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function cacheSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_CACHE, JSON.stringify(settings));
  } catch {
    // Storage blocked: the page just falls back to applying at document_idle.
  }
}

export function readCachedCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_CACHE) === '1';
  } catch {
    return false;
  }
}

export function cacheCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_CACHE, collapsed ? '1' : '0');
  } catch {
    // See cacheSettings.
  }
}

/** CSS hiding the switched-off tabs, mirroring nav.ts's tabKey/host. */
function hiddenTabsCss(settings: Settings): string {
  const selectors: string[] = [];
  for (const [key, on] of Object.entries(settings.nav.tabs)) {
    if (on !== false || !/^[a-z0-9-]+$/.test(key)) continue;
    for (const id of [key, `${key}-tab`]) {
      selectors.push(`a[data-tab-item="${id}" i]`, `li:has(> a[data-tab-item="${id}" i])`);
    }
    selectors.push(`a[data-tab-item^="i"][data-tab-item$="${key}-tab" i]`);
    selectors.push(`li:has(> a[data-tab-item^="i"][data-tab-item$="${key}-tab" i])`);
  }
  return selectors.length ? `${selectors.join(',\n')} { display: none !important; }` : '';
}

function setStyle(css: string): void {
  let style = document.getElementById(STYLE_ID);
  if (!css) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    // <head> may not exist yet at document_start; <html> always does.
    (document.head ?? document.documentElement).appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

/**
 * Apply what can be known from settings and the URL alone. At document_start
 * the PR-sidebar attributes are a prediction (column by viewport width); the
 * layout and sidebar-toggle passes correct them once the page is there.
 */
export function applyEarly(settings: Settings, opts: { predict?: boolean } = {}): void {
  const root = document.documentElement;
  const onPR = isPRPage();

  root.toggleAttribute('data-ghe-redesign', settings.appearance.redesign && onPR);
  root.toggleAttribute('data-ghe-hide-footer', settings.layout.hideFooter);
  root.toggleAttribute('data-ghe-tab-accent', settings.nav.accentSelectedTab);

  root.style.setProperty('--ghe-sidebar-width', `${settings.layout.sidebarWidthPct}%`);
  const wider = onPR && settings.layout.pageMaxWidth > PAGE_WIDTH_DEFAULT;
  root.toggleAttribute('data-ghe-page-width', wider);
  if (wider) root.style.setProperty('--ghe-page-max-width', `${settings.layout.pageMaxWidth}px`);
  else root.style.removeProperty('--ghe-page-max-width');

  if (opts.predict && onPR && window.innerWidth >= COLUMN_MIN_WIDTH) {
    const collapsed = settings.layout.sidebarToggle && readCachedCollapsed();
    root.toggleAttribute('data-ghe-sidebar-toggle', settings.layout.sidebarToggle);
    root.toggleAttribute('data-ghe-sidebar-collapsed', collapsed);
    root.toggleAttribute('data-ghe-wide-sidebar', !collapsed);
  }

  setStyle(hiddenTabsCss(settings));
}
