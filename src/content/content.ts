// Content-script entry point. Loads settings, applies every feature, and
// re-applies on DOM mutations, GitHub (Turbo/PJAX) navigations, and settings
// changes. Each feature is idempotent and guarded so one failure can't break
// the others or the page.

import { Settings, loadSettings, onSettingsChanged } from '../shared/settings';
import { applyDates } from './features/dates';
import { applySidebar } from './features/sidebar';
import { applyHideButtons } from './features/hideComments';
import {
  applyLayout,
  checksMisplaced,
  invalidateLayout,
  resetLayout,
} from './features/layout';
import { applyNav } from './features/nav';
import { applyNotices } from './features/notices';
import { applyRedesign } from './features/redesign';
import { isResizing, setResizing } from './util';

let current: Settings | null = null;
let scheduled = false;
let observer: MutationObserver | null = null;

// True while a soft navigation is in flight. Layout moves are suppressed so
// the mutation observer can't re-relocate the checks box into a view that's
// about to be torn down.
let navigating = false;
let navigatingTimer = 0;

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
    run('layout', () => {
      if (!navigating) applyLayout(settings);
    });
    run('nav', () => applyNav(settings));
    run('notices', () => applyNotices(settings));
    run('redesign', () => applyRedesign(settings));
  } finally {
    connectObserver();
  }
}

function schedule(): void {
  if (scheduled || !current) return;
  // Mutations that land mid-resize are GitHub's responsive re-renders; the
  // one pass scheduled when the resize settles picks up whatever they did.
  if (isResizing()) return;
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

  // A soft navigation is starting: restore every moved node to its origin
  // BEFORE the old view is torn down, and hold off re-applying until the
  // navigation settles (endNavigation). React removes a child from the parent
  // it rendered it into, so a box still relocated at teardown breaks the
  // unmount, gets lost with the detached tree, and — because React still
  // considers the mergebox mounted — no fresh copy is mounted on return: the
  // checks vanish until a full reload.
  const beginNavigation = (): void => {
    navigating = true;
    run('layout-reset', resetLayout);
    // Failsafe: resume even if no end/success event ever arrives.
    clearTimeout(navigatingTimer);
    navigatingTimer = window.setTimeout(endNavigation, 3000);
  };
  const endNavigation = (): void => {
    clearTimeout(navigatingTimer);
    navigating = false;
    schedule();
  };

  // GitHub instruments every soft navigation — Turbo and the React-Router
  // ones (e.g. the PR Conversation ⇄ Files-changed tabs, where no turbo:*
  // event ever fires) — with soft-nav:* events on document. popstate covers
  // history back/forward, which can skip soft-nav:start.
  for (const evt of ['soft-nav:start', 'turbo:before-visit']) {
    document.addEventListener(evt, beginNavigation);
  }
  window.addEventListener('popstate', beginNavigation);
  for (const evt of ['soft-nav:end', 'soft-nav:success', 'soft-nav:fail']) {
    document.addEventListener(evt, endNavigation);
  }

  // GitHub navigates without full reloads; re-apply on those transitions.
  // These also mark the end of a navigation for surfaces that never emit
  // soft-nav events (older Turbo/pjax pages, bfcache restores).
  for (const evt of ['turbo:load', 'turbo:render', 'pjax:end']) {
    document.addEventListener(evt, endNavigation);
  }
  window.addEventListener('pageshow', endNavigation);

  // Before Turbo snapshots the page for its cache (e.g. when switching to the
  // Files-changed tab on Turbo-driven views), undo our layout moves so the
  // cached Conversation view is pristine. Otherwise it comes back with a
  // stale, orphaned checks box — React remounts a fresh mergebox at the origin
  // and the relocated copy is lost. On restore, applyLayout reconciles from
  // the clean slate.
  document.addEventListener('turbo:before-cache', () => run('layout-reset', resetLayout));

  // The checks box hops between the timeline top and the sidebar by width, so
  // re-evaluate once the window has stopped resizing. While the drag is in
  // flight every mutation-driven pass is suspended (see setResizing): GitHub
  // re-renders its responsive layout on every frame of the drag, and running
  // all features per frame made resizing crawl.
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    setResizing(true);
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      setResizing(false);
      schedule();
    }, 150);
  });

  // Safety-net poll. GitHub's React re-renders can drop the relocated checks
  // box from the sidebar in ways the mutation observer misses (notably after
  // Turbo tab navigation). Twice a second, if the checks belong in the sidebar
  // but aren't visibly there, force a clean reconcile. It's a no-op — and never
  // touches the DOM — while the box is healthy, so it can't cause flicker. The
  // log is edge-triggered so a persistently broken window can't spam it.
  let loggedMisplaced = false;
  window.setInterval(() => {
    // Paused mid-navigation: the old view is being torn down and moving the
    // box back into it would recreate the very orphaning this poll heals.
    if (!current || navigating || isResizing()) return;
    if (checksMisplaced(current)) {
      if (!loggedMisplaced) {
        console.debug('[github-enhance] checks not in sidebar — reconciling');
        loggedMisplaced = true;
      }
      invalidateLayout();
      schedule();
    } else {
      loggedMisplaced = false;
    }
  }, 500);
}

void init();
