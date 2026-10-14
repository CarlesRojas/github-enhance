// Fade a pull request in once our layout is in place, instead of showing it
// while the checks box and sidebar are still being moved.
//
// What's below the PR's tabs (the timeline and sidebar; the title and tabs
// show straight away) is held at opacity 0 by content.css while <html>
// carries the attribute, then fades in when it's removed:
// - Full load: boot.ts sets it at document_start, before the first paint.
// - Soft navigation: the first pass that sees a new conversation sets it, in
//   the same frame the view is inserted (passes run in requestAnimationFrame,
//   before paint).
// A view is "new" only when it's for a different URL than the one revealed:
// GitHub re-renders the conversation in place (hydration, live updates), and
// treating each re-render as new hid and re-faded the page right after it had
// faded in.
// It's removed after the first pass that ran with the layout unsuspended. A
// timer reveals the page regardless, so a failure can never leave it hidden.

import { isPRPage } from '../util';

const ATTR = 'data-ghe-fade';
const FAILSAFE_MS = 3000;

/** The page last revealed (and its view), so each page fades in only once. */
let revealedPath: string | null = null;
let revealedView: Element | null = null;
let failsafe = 0;
let revealing = false;

function hide(): void {
  document.documentElement.setAttribute(ATTR, '');
  clearTimeout(failsafe);
  failsafe = window.setTimeout(show, FAILSAFE_MS);
}

function show(): void {
  clearTimeout(failsafe);
  document.documentElement.removeAttribute(ATTR);
}

/** document_start: hide a PR page before it first paints. */
export function hideBeforePaint(): void {
  if (isPRPage()) hide();
}

/**
 * Run at the end of every pass. `settled` is false while a soft navigation
 * holds back the layout moves; the view stays hidden until a settled pass.
 */
export function applyFadeIn(settled: boolean): void {
  const view = isPRPage() ? document.querySelector('.js-discussion') : null;
  // Not a conversation (Files changed, other pages): nothing waits on our
  // layout, so show whatever is hidden right away.
  const path = location.pathname;
  if (!view) {
    // Kept on the same URL: a re-render can drop the view for a pass.
    if (path !== revealedPath) revealedPath = revealedView = null;
    if (!revealing) show();
    return;
  }
  if (path === revealedPath) {
    revealedView = view;
    return;
  }
  // The URL can change before the new view arrives; the old one, still on
  // screen, stays visible until it's replaced.
  if (view === revealedView) return;
  if (!document.documentElement.hasAttribute(ATTR)) hide();
  if (!settled) return;

  revealedPath = path;
  revealedView = view;
  revealing = true;
  // Two frames: the first paints the finished layout at opacity 0, so
  // dropping the attribute in the second runs the transition.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      revealing = false;
      show();
    }),
  );
}
