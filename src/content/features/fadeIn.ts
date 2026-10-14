// Fade a pull request in once our layout is in place, instead of showing it
// while the checks box and sidebar are still being moved.
//
// Everything from the PR title down (#repo-content-pjax-container; the repo
// header and tab bar stay put) is held at opacity 0 by content.css while
// <html> carries the attribute, then fades in when it's removed:
// - Full load: boot.ts sets it at document_start, before the first paint.
// - Soft navigation: the first pass that sees a new conversation sets it, in
//   the same frame the view is inserted (passes run in requestAnimationFrame,
//   before paint).
// It's removed after the first pass that ran with the layout unsuspended. A
// timer reveals the page regardless, so a failure can never leave it hidden.

import { isPRPage } from '../util';

const ATTR = 'data-ghe-fade';
const FAILSAFE_MS = 3000;

/** The conversation view last revealed, so each view fades in only once. */
let revealed: Element | null = null;
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
  if (!view) {
    revealed = null;
    if (!revealing) show();
    return;
  }
  if (view === revealed) return;
  if (!document.documentElement.hasAttribute(ATTR)) hide();
  if (!settled) return;

  revealed = view;
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
