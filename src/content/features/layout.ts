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

import { Settings } from '../../shared/settings';

const SIG = 'data-ghe-layout';
const MOVED = 'data-ghe-moved';
const LIFTED = 'ghe-lifted';
const IN_SIDEBAR = 'ghe-checks-in-sidebar';
const WIDE_MARK = 'ghe-wide-target';

/** Sidebar width while the checks box lives in it (default pane is 320px). */
const SIDEBAR_WIDTH = '640px';
const WIDE_PROPS = ['--pane-width', 'width', 'min-width', 'max-width'];

/**
 * Widen the sidebar pane. Applied as inline !important styles to both the
 * Primer PageLayout pane and its PaneWrapper (the flex child) — injected CSS
 * classes lose to the React layout's own styles, inline importants don't.
 */
function widenSidebar(): void {
  const pane = document.querySelector<HTMLElement>(
    '#pr-conversation-sidebar, .Layout-sidebar',
  );
  if (!pane) return;
  const targets = [pane];
  const wrap = pane.parentElement;
  if (wrap && /PaneWrapper/i.test(wrap.className)) targets.push(wrap);
  for (const el of targets) {
    el.classList.add(WIDE_MARK);
    WIDE_PROPS.forEach((p) => el.style.setProperty(p, SIDEBAR_WIDTH, 'important'));
  }
}

function unwidenSidebar(): void {
  document.querySelectorAll<HTMLElement>('.' + WIDE_MARK).forEach((el) => {
    WIDE_PROPS.forEach((p) => el.style.removeProperty(p));
    el.classList.remove(WIDE_MARK);
  });
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
    el.style.setProperty('margin-bottom', '0', 'important');
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
  unwidenSidebar();
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

/** True when the sidebar is rendered as a right-hand column (desktop widths). */
function sidebarIsColumn(): boolean {
  const sidebar = findSidebar();
  if (!sidebar) return false;
  const r = sidebar.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  return r.left > window.innerWidth / 2;
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
  const discussion = document.querySelector<HTMLElement>('.js-discussion');
  if (!discussion) return;

  const checks = checksPlacement(settings);
  const compose: 'off' | 'top' = settings.layout.composeTop ? 'top' : 'off';
  const sig = `${checks}:${compose}`;
  const current = discussion.getAttribute(SIG) ?? 'off:off';
  if (current === sig) {
    // Re-assert the widened pane — React re-renders can wipe inline styles.
    if (checks === 'sidebar') widenSidebar();
    return;
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
      widenSidebar();
    } else {
      lift(mergeBox, false);
      insertAfterDescription(mergeBox, discussion, description);
    }
  }

  discussion.setAttribute(SIG, sig);
}
