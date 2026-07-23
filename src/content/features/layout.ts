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

function setStickySidebar(on: boolean): void {
  document.documentElement.toggleAttribute(STICKY_ATTR, on);
}

/**
 * Publish the offset the sticky sidebar should sit below: the height of
 * GitHub's own sticky pull-request header (which floats over the page when
 * scrolled) plus a small gap. Measured live so it tracks the header's real
 * height; the CSS falls back to a sensible default when it can't be measured
 * (e.g. before the header is in the DOM). Cleared when sticky is off.
 */
function applyStickyTop(on: boolean): void {
  if (!on) {
    setVar('--ghe-sticky-top', null);
    return;
  }
  const header = document.querySelector<HTMLElement>(
    '[class*="StickyPullRequestHeader-module__prHeader"]',
  );
  const h = header ? header.getBoundingClientRect().height : 0;
  setVar('--ghe-sticky-top', h > 0 ? `${Math.round(h) + 8}px` : null);
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

function markOrigin(node: Movable): void {
  if (node.getAttribute(MOVED) === '1') return;
  const placeholder = document.createComment('ghe-layout-placeholder');
  node.parentElement?.insertBefore(placeholder, node);
  node.__ghePlaceholder = placeholder;
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
    node.__ghePlaceholder = undefined;
    node.removeAttribute(MOVED);
  });
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

/** The checks / merge status box (classic id, or the newer React mergebox). */
function findMergeBox(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('#partial-pull-merging') ||
    document.querySelector<HTMLElement>('[data-testid="mergebox-partial"]') ||
    document.querySelector<HTMLElement>('.js-merge-pr, .merge-pr, .merge-message') ||
    null
  );
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

/**
 * True when the sidebar is rendered as a right-hand column (desktop widths).
 *
 * IMPORTANT: this must not depend on the sidebar's own geometry relative to
 * the viewport midpoint — widening the pane moves its left edge, which made a
 * position-based check flip its own answer and oscillate (widen → "not a
 * column" → unwiden → "column" → …). The viewport breakpoint (Primer's lg,
 * where PageLayout shows panes as columns) is independent of anything we do.
 */
function sidebarIsColumn(): boolean {
  const sidebar = findSidebar();
  if (!sidebar) return false;
  const r = sidebar.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false; // hidden (stacked/mobile)
  return window.innerWidth >= 1012;
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
    applyStickyTop(false);
    return;
  }

  // Widen the sidebar whenever it's shown as a column on a PR page. This is
  // independent of whether the checks box is moved into it — the width slider
  // controls the sidebar size on its own. Re-evaluated on every pass (incl.
  // resize), so it turns off when the sidebar stacks at narrow widths.
  setWideSidebar(isPRPage() && sidebarIsColumn());
  // Sticky sidebar only makes sense while it's a column; behind its own toggle.
  const sticky = settings.layout.stickySidebar && isPRPage() && sidebarIsColumn();
  setStickySidebar(sticky);
  applyStickyTop(sticky);

  const checks = checksPlacement(settings);
  const compose: 'off' | 'top' = settings.layout.composeTop ? 'top' : 'off';
  const sig = `${checks}:${compose}`;
  const current = discussion.getAttribute(SIG) ?? 'off:off';
  if (current === sig) return;

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
