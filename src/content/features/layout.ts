// Feature 5: move the checks and compose boxes up in the PR conversation.
//
//   • composeTop — move the "Add a comment" box above the timeline.
//   • checksTop  — move the checks / merge box up: above the timeline on
//     mobile, or into the sidebar on desktop (when the sidebar is a column).
//
// Every moved node leaves a placeholder at its original spot. The whole thing
// reconciles from a clean slate whenever the desired arrangement changes —
// including on resize, when the checks box hops between top and sidebar — so
// any state restores correctly without a reload.

import { PAGE_WIDTH_DEFAULT, Settings } from '../../shared/settings';
import { isPRPage } from '../util';

const SIG = 'data-ghe-layout';
const MOVED = 'data-ghe-moved';
const LIFTED = 'ghe-lifted';
const IN_SIDEBAR = 'ghe-checks-in-sidebar';
/**
 * Widening the sidebar is done purely in CSS (see content.css), keyed off an
 * attribute on <html> — an element GitHub's React never touches. Writing
 * inline styles onto the pane caused a loop: GitHub's own script re-sets the
 * pane width, we re-asserted, and the two fought forever. A stylesheet
 * !important rule beats their non-important inline width in the cascade, so
 * this wins statically with zero DOM writes.
 */
const WIDE_ATTR = 'data-ghe-wide-sidebar';
const PAGE_ATTR = 'data-ghe-page-width';
const STICKY_ATTR = 'data-ghe-sticky-sidebar';
const FOOTER_ATTR = 'data-ghe-hide-footer';

function setWideSidebar(on: boolean): void {
  document.documentElement.toggleAttribute(WIDE_ATTR, on);
}

/** Breathing room between the floating header's bottom and the sidebar's top. */
const STICKY_GAP = 16;

// Sticky-header measurement state. GitHub's floating PR header only gains its
// real height once it's marked "stuck" on scroll — a class change our
// childList-only MutationObserver never sees. So we cache the height the first
// time it's measurable and re-measure on scroll to catch it the instant it
// appears, rather than waiting for an unrelated mutation.
let stickyOn = false;
let stickyHeaderHeight = 0;
let stickyScrollHooked = false;
let stickyScrollRaf = 0;

function setStickySidebar(on: boolean): void {
  document.documentElement.toggleAttribute(STICKY_ATTR, on);
}

/** Measure GitHub's floating PR header, caching the last real (>0) height. */
function measureStickyHeader(): number {
  const header = document.querySelector<HTMLElement>(
    '[class*="StickyPullRequestHeader-module__prHeader"]',
  );
  const h = header ? Math.round(header.getBoundingClientRect().height) : 0;
  if (h > 0) stickyHeaderHeight = h;
  return stickyHeaderHeight;
}

/**
 * Publish the offset the sticky sidebar sits below: the height of GitHub's own
 * floating pull-request header plus a gap. Cleared when sticky is off; falls
 * back to the CSS default until the header has been measured once (it only has
 * a real height while stuck).
 */
function publishStickyTop(): void {
  if (!stickyOn) {
    setVar('--ghe-sticky-top', null);
    return;
  }
  const h = measureStickyHeader();
  setVar('--ghe-sticky-top', h > 0 ? `${h + STICKY_GAP}px` : null);
}

/**
 * Re-measure on scroll (rAF-throttled) so the offset is correct the moment the
 * floating header becomes stuck, instead of lagging until the next unrelated
 * DOM mutation. Registered once; a no-op while sticky is off.
 */
function hookStickyScroll(): void {
  if (stickyScrollHooked) return;
  stickyScrollHooked = true;
  window.addEventListener(
    'scroll',
    () => {
      if (!stickyOn || stickyScrollRaf) return;
      stickyScrollRaf = requestAnimationFrame(() => {
        stickyScrollRaf = 0;
        publishStickyTop();
      });
    },
    { passive: true },
  );
}

/** Set a CSS custom property on <html> only when the value actually changed. */
function setVar(name: string, value: string | null): void {
  const style = document.documentElement.style;
  if (value === null) {
    if (style.getPropertyValue(name)) style.removeProperty(name);
  } else if (style.getPropertyValue(name) !== value) {
    style.setProperty(name, value);
  }
}

/** Publish the slider values as CSS variables consumed by content.css. */
function applyWidthVars(settings: Settings, onPR: boolean): void {
  setVar('--ghe-sidebar-width', `${settings.layout.sidebarWidthPct}%`);

  const wider = onPR && settings.layout.pageMaxWidth > PAGE_WIDTH_DEFAULT;
  document.documentElement.toggleAttribute(PAGE_ATTR, wider);
  setVar('--ghe-page-max-width', wider ? `${settings.layout.pageMaxWidth}px` : null);
}

interface Movable extends HTMLElement {
  __ghePlaceholder?: Comment;
}

// Every placeholder we create, tracked so orphans can be swept. When React
// remounts a box we moved, it removes our relocated node without touching the
// placeholder comment left at the origin — resetLayout restores nodes via
// their placeholder ref, so a removed node's placeholder would otherwise
// linger and accumulate over a long-open page.
const placeholders = new Set<Comment>();

function markOrigin(node: Movable): void {
  if (node.getAttribute(MOVED) === '1') return;
  const placeholder = document.createComment('ghe-layout-placeholder');
  node.parentElement?.insertBefore(placeholder, node);
  node.__ghePlaceholder = placeholder;
  placeholders.add(placeholder);
  node.setAttribute(MOVED, '1');
}

/**
 * Zero a moved box's desktop-only left indent (`tmp-ml-md-6` margin +
 * `tmp-pl-md-3` padding, tuned for its original spot) so it lines up with the
 * column it's moved into. In the sidebar also drop its vertical margins (it
 * sits flush at the top) and flag it so its left status icon can be hidden.
 * Inline `!important` is required to beat the utilities' own `!important`.
 */
function lift(el: HTMLElement, inSidebar: boolean): void {
  el.classList.add(LIFTED);
  el.style.setProperty('margin-left', '0', 'important');
  el.style.setProperty('padding-left', '0', 'important');
  if (inSidebar) {
    el.classList.add(IN_SIDEBAR);
    el.style.setProperty('margin-top', '0', 'important');
    // Match the visible gap between sidebar cards: their spacing stacks our
    // --ghe-gap margin on top of GitHub's own native item spacing, so the
    // lifted box (not a native sidebar item) needs twice the gap to line up.
    el.style.setProperty('margin-bottom', 'calc(var(--ghe-gap, 8px) * 2)', 'important');
  }
}

export function resetLayout(): void {
  document.querySelectorAll<Movable>(`[${MOVED}="1"]`).forEach((node) => {
    const ph = node.__ghePlaceholder;
    if (ph && ph.parentElement) {
      ph.parentElement.insertBefore(node, ph);
      ph.remove();
    }
    if (ph) placeholders.delete(ph);
    node.__ghePlaceholder = undefined;
    node.removeAttribute(MOVED);
  });
  // Sweep placeholders whose moved node never came back through the loop above
  // (React removed it), so orphaned comments don't pile up at the origin.
  placeholders.forEach((ph) => ph.remove());
  placeholders.clear();
  document.querySelectorAll<HTMLElement>('.' + LIFTED).forEach((el) => {
    ['margin-left', 'padding-left', 'margin-top', 'margin-bottom'].forEach((p) =>
      el.style.removeProperty(p),
    );
    el.classList.remove(LIFTED, IN_SIDEBAR);
  });
  document.querySelector('.js-discussion')?.removeAttribute(SIG);
}

/** The first comment in the conversation — the PR/issue description. */
function descriptionEntry(discussion: HTMLElement): HTMLElement | null {
  const first = discussion.querySelector<HTMLElement>(
    '.timeline-comment, .comment-body, .markdown-body',
  );
  return (
    first?.closest<HTMLElement>(
      '.js-timeline-item, .TimelineItem, .timeline-comment-wrapper',
    ) ?? null
  );
}

// Every checks / merge box variant. The two containers are what GitHub mounts
// at the top level (classic server-rendered id, and the newer React mergebox);
// the trailing classic selectors are older/fallback forms.
const MERGE_BOX_CONTAINER_SEL = '#partial-pull-merging, [data-testid="mergebox-partial"]';
const MERGE_BOX_SEL = `${MERGE_BOX_CONTAINER_SEL}, .js-merge-pr, .merge-pr, .merge-message`;
const MERGE_BOX_MOVED_SEL = MERGE_BOX_SEL.split(',')
  .map((s) => `${s.trim()}[${MOVED}="1"]`)
  .join(', ');

/** The checks / merge status box (classic id, or the newer React mergebox). */
function findMergeBox(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('#partial-pull-merging') ||
    document.querySelector<HTMLElement>('[data-testid="mergebox-partial"]') ||
    document.querySelector<HTMLElement>('.js-merge-pr, .merge-pr, .merge-message') ||
    null
  );
}

/**
 * True while the React mergebox is still showing its own loading spinner. It
 * re-renders — sometimes remounting the node entirely — once merge data
 * arrives, so grabbing and moving it mid-load can strand the detached spinner
 * in the sidebar (React then mounts a fresh mergebox at the origin, and our
 * SIG guard never reconciles it away). Wait for it to settle first.
 */
function mergeBoxLoading(box: HTMLElement): boolean {
  return !!box.querySelector('[class*="MergeBox-module__mergeboxLoading"]');
}

/** The checks / merge box we already relocated (marked as moved). */
function movedMergeBoxPresent(): boolean {
  return !!document.querySelector<HTMLElement>(MERGE_BOX_MOVED_SEL);
}

/**
 * True when a settled checks / merge box that we have NOT moved is on the page.
 * GitHub's React re-renders the mergebox on CI updates and can remount a fresh
 * copy at the origin, orphaning the one we relocated into the sidebar — the
 * "checks disappeared from the sidebar after a while" symptom. A fresh box is
 * the signal to reconcile. Boxes still loading are skipped so we swap only once
 * the replacement is ready, avoiding a flicker.
 */
function freshMergeBoxPresent(): boolean {
  const boxes = document.querySelectorAll<HTMLElement>(MERGE_BOX_CONTAINER_SEL);
  for (const box of boxes) {
    if (box.getAttribute(MOVED) === '1') continue; // the one we relocated
    if (box.closest(`[${MOVED}="1"]`)) continue; // nested inside it
    if (mergeBoxLoading(box)) continue; // not ready to move yet
    return true;
  }
  return false;
}

/**
 * Whether the current placement still holds. The signature alone can't tell:
 * React can silently swap the mergebox out from under us without any settings
 * change, so verify the checks box is where we left it and no fresh, unmoved
 * copy has appeared.
 */
function checksIntact(checks: ChecksPlacement): boolean {
  if (checks === 'off') return true;
  if (freshMergeBoxPresent()) return false; // React remounted a fresh copy
  return movedMergeBoxPresent(); // our relocated copy still present
}

/** The "Add a comment" composer only — NOT other people's / CI comments. */
function findComposeBox(): HTMLElement | null {
  const field = document.querySelector<HTMLElement>(
    '#new_comment_field, textarea[name="comment[body]"]',
  );
  return (
    document.querySelector<HTMLElement>('.timeline-new-comment') ||
    document.querySelector<HTMLElement>('form.js-new-comment-form') ||
    field?.closest<HTMLElement>('form') ||
    null
  );
}

function findSidebar(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('#partial-discussion-sidebar') ||
    document.querySelector<HTMLElement>('.Layout-sidebar')
  );
}

/** The main conversation column the sidebar sits beside (classic + React). */
function findMainColumn(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('.Layout-main') ||
    document.querySelector<HTMLElement>('[class*="prc-PageLayout-ContentWrapper"]') ||
    document.querySelector<HTMLElement>('.js-discussion')
  );
}

/**
 * True when the sidebar is rendered as a right-hand column rather than stacked
 * below the content.
 *
 * Detected from geometry — the sidebar sits to the right of the main column —
 * not a fixed viewport breakpoint. GitHub flips the sidebar to a column below
 * 1012px on some layouts, and the old hard-coded `>= 1012` left the checks box
 * stranded below the description while a real sidebar was on screen at those
 * in-between widths.
 *
 * IMPORTANT: the test must not depend on the sidebar's position relative to the
 * viewport midpoint — widening the pane (which we do whenever it's a column)
 * moves its left edge, and a midpoint test would flip its own answer and
 * oscillate (widen → "not a column" → unwiden → "column" → …). Comparing the
 * sidebar's left edge to the main column's right edge is stable under widening:
 * the two panes stay adjacent, so the sidebar's left edge remains past the main
 * column's right edge at every column width.
 */
function sidebarIsColumn(): boolean {
  const sidebar = findSidebar();
  if (!sidebar) return false;
  const sr = sidebar.getBoundingClientRect();
  if (sr.width === 0 || sr.height === 0) return false; // hidden (stacked/mobile)

  const main = findMainColumn();
  if (!main) return window.innerWidth >= 1012; // fallback: Primer's lg breakpoint
  const mr = main.getBoundingClientRect();
  if (mr.width === 0 || mr.height === 0) return window.innerWidth >= 1012;

  // Side-by-side when the sidebar starts at or past the main column's right
  // edge; stacked when it shares the main column's horizontal span and sits
  // below it. 1px tolerance absorbs sub-pixel rounding.
  return sr.left >= mr.right - 1;
}

type ChecksPlacement = 'off' | 'top' | 'sidebar';

function checksPlacement(settings: Settings): ChecksPlacement {
  if (!settings.layout.checksTop) return 'off';
  return sidebarIsColumn() ? 'sidebar' : 'top';
}

function insertAfterDescription(
  node: HTMLElement,
  discussion: HTMLElement,
  description: HTMLElement | null,
): void {
  const parent = description?.parentElement ?? discussion;
  const ref = description ? description.nextSibling : discussion.firstChild;
  parent.insertBefore(node, ref);
}

export function applyLayout(settings: Settings): void {
  applyWidthVars(settings, isPRPage());

  // Footer hiding is site-wide, so toggle it before any PR-page early return.
  document.documentElement.toggleAttribute(FOOTER_ATTR, settings.layout.hideFooter);

  const discussion = document.querySelector<HTMLElement>('.js-discussion');
  if (!discussion) {
    // GitHub navigates without full reloads, so attributes on <html> survive
    // leaving the PR page — clear them or other pages' sidebars get widened.
    setWideSidebar(false);
    setStickySidebar(false);
    stickyOn = false;
    publishStickyTop();
    return;
  }

  // Widen the sidebar whenever it's shown as a column on a PR page. This is
  // independent of whether the checks box is moved into it — the width slider
  // controls the sidebar size on its own. Re-evaluated on every pass (incl.
  // resize), so it turns off when the sidebar stacks at narrow widths.
  setWideSidebar(isPRPage() && sidebarIsColumn());
  // Sticky sidebar only makes sense while it's a column; behind its own toggle.
  const sticky = settings.layout.stickySidebar && isPRPage() && sidebarIsColumn();
  stickyOn = sticky;
  setStickySidebar(sticky);
  if (sticky) hookStickyScroll();
  publishStickyTop();

  const checks = checksPlacement(settings);
  const compose: 'off' | 'top' = settings.layout.composeTop ? 'top' : 'off';
  const sig = `${checks}:${compose}`;
  const current = discussion.getAttribute(SIG) ?? 'off:off';
  // Skip only when the arrangement is unchanged AND still intact. The signature
  // alone isn't enough: GitHub's React can remount the mergebox on a CI update
  // with no settings change, orphaning the copy we moved into the sidebar, and
  // a signature-only guard would never re-reconcile it (checks vanish from the
  // sidebar after the page has been open a while).
  if (current === sig && checksIntact(checks)) return;

  // A remounted mergebox leaves our relocated copy a stale orphan. Drop it (its
  // placeholder is swept by resetLayout) so the clean-slate reset below doesn't
  // restore it as a duplicate of the fresh box React mounted at the origin.
  if (checks !== 'off' && freshMergeBoxPresent()) {
    document
      .querySelectorAll<HTMLElement>(MERGE_BOX_MOVED_SEL)
      .forEach((node) => node.remove());
  }

  // Reconcile from a clean slate every time the desired arrangement changes.
  resetLayout();
  if (sig === 'off:off') return;

  const safe = (n: HTMLElement | null): n is HTMLElement =>
    !!n && n !== discussion && !n.contains(discussion);

  const mergeBox = checks !== 'off' ? findMergeBox() : null;
  const composeBox = compose !== 'off' ? findComposeBox() : null;
  const sidebar = checks === 'sidebar' ? findSidebar() : null;

  // Wait until everything we need is present (page still loading) — retry.
  if (checks !== 'off' && !safe(mergeBox)) return;
  // ...and until the mergebox has settled out of its loading state, so we
  // don't move a spinner node that React is about to remount.
  if (safe(mergeBox) && mergeBoxLoading(mergeBox)) return;
  if (checks === 'sidebar' && !sidebar) return;
  if (compose !== 'off' && !safe(composeBox)) return;

  const description = descriptionEntry(discussion);

  // Compose first, then checks after the description, so checks sits above it.
  if (safe(composeBox)) {
    markOrigin(composeBox);
    lift(composeBox, false);
    insertAfterDescription(composeBox, discussion, description);
  }

  if (safe(mergeBox)) {
    markOrigin(mergeBox);
    if (checks === 'sidebar' && sidebar) {
      lift(mergeBox, true);
      sidebar.prepend(mergeBox);
    } else {
      lift(mergeBox, false);
      insertAfterDescription(mergeBox, discussion, description);
    }
  }

  discussion.setAttribute(SIG, sig);
}
