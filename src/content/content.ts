// Content-script entry point. Loads settings, applies every feature, and
// re-applies on DOM mutations, GitHub (Turbo/PJAX) navigations, and settings
// changes. Each feature is idempotent and guarded so one failure can't break
// the others or the page.

import { Settings, loadSettings, onSettingsChanged } from '../shared/settings';
import { applyDates } from './features/dates';
import { applySidebar } from './features/sidebar';
import { applyHideButtons } from './features/hideComments';
import { applyLayout } from './features/layout';
import { applyNotices } from './features/notices';
import { applyRedesign } from './features/redesign';

let current: Settings | null = null;
let scheduled = false;
let observer: MutationObserver | null = null;

function run(name: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.debug(`[github-enhance] ${name} failed`, err);
  }
}

function applyAll(settings: Settings): void {
  // Detach the observer while we mutate the DOM so our own changes don't
  // trigger another pass.
  observer?.disconnect();
  try {
    run('dates', () => applyDates(settings));
    run('sidebar', () => applySidebar(settings));
    run('hideComments', () => applyHideButtons(settings));
    run('layout', () => applyLayout(settings));
    run('notices', () => applyNotices(settings));
    run('redesign', () => applyRedesign(settings));
  } finally {
    connectObserver();
  }
}

function schedule(): void {
  if (scheduled || !current) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    if (current) applyAll(current);
  });
}

function connectObserver(): void {
  if (!observer) observer = new MutationObserver(() => schedule());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

async function init(): Promise<void> {
  current = await loadSettings();
  applyAll(current);

  onSettingsChanged((settings) => {
    current = settings;
    applyAll(settings);
  });

  // GitHub navigates without full reloads; re-apply on those transitions.
  for (const evt of ['turbo:load', 'turbo:render', 'pjax:end', 'pageshow']) {
    document.addEventListener(evt, () => schedule());
  }

  // The checks box hops between the timeline top and the sidebar by width, so
  // re-evaluate when the window is resized (debounced).
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => schedule(), 150);
  });
}

void init();
