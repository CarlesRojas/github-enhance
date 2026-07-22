// Feature 4/5 (experimental): rearrange the pull-request conversation.
//
// Three independent toggles:
//   • checksTop      — move the checks / merge box above the timeline
//   • composeTop     — move the "Add a comment" box above the timeline
//   • invertTimeline — reverse the timeline items (newest first), in place
//
// With everything on the order becomes: description, checks, compose, then the
// reversed timeline. Each toggle also works on its own.
//
// Every moved node leaves a placeholder at its original spot. The whole thing
// reconciles from a clean slate whenever the desired arrangement changes, so
// any combination of toggles restores correctly without a reload.

import { Settings } from '../../shared/settings';

const SIG = 'data-ghe-layout';
const MOVED = 'data-ghe-moved';

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

/** The "Add a comment" composer, via its unique new-comment field. */
function findComposeBox(): HTMLElement | null {
  const field = document.querySelector<HTMLElement>(
    '#new_comment_field, textarea[name="comment[body]"], .js-new-comment-form',
  );
  const wrapper = field?.closest<HTMLElement>(
    '.timeline-comment-wrapper, .discussion-timeline-actions, .js-comment-container',
  );
  return wrapper || document.querySelector<HTMLElement>('.discussion-timeline-actions') || null;
}

export function applyLayout(settings: Settings): void {
  const discussion = document.querySelector<HTMLElement>('.js-discussion');
  if (!discussion) return;

  const { checksTop, composeTop, invertTimeline } = settings.layout;
  const sig = `${checksTop ? 1 : 0}${composeTop ? 1 : 0}${invertTimeline ? 1 : 0}`;
  const current = discussion.getAttribute(SIG) ?? '000';
  if (current === sig) return;

  // Reconcile from a clean slate every time the desired arrangement changes.
  resetLayout();
  if (sig === '000') return;

  const safe = (n: HTMLElement | null): n is HTMLElement =>
    !!n && n !== discussion && !n.contains(discussion);

  const description = descriptionEntry(discussion);
  const entries = Array.from(
    discussion.querySelectorAll<HTMLElement>('.js-timeline-item'),
  );
  const items = entries.filter(
    (e) =>
      e !== description &&
      !(description && (e.contains(description) || description.contains(e))),
  );

  const mergeBox = checksTop ? findMergeBox() : null;
  const composeBox = composeTop ? findComposeBox() : null;
  const willReverse = invertTimeline && items.length >= 2;

  // Nothing actionable yet (page still loading) — leave sig unset to retry.
  if (!safe(mergeBox) && !safe(composeBox) && !willReverse) return;

  // Record origins up front so restore is exact.
  if (safe(mergeBox)) markOrigin(mergeBox);
  if (safe(composeBox)) markOrigin(composeBox);
  if (willReverse) items.forEach((e) => safe(e) && markOrigin(e));

  // Move checks/compose to just after the description (checks first).
  if (safe(mergeBox) || safe(composeBox)) {
    const top = document.createDocumentFragment();
    if (safe(mergeBox)) top.appendChild(mergeBox);
    if (safe(composeBox)) top.appendChild(composeBox);
    const parent = description?.parentElement ?? discussion;
    const ref = description ? description.nextSibling : discussion.firstChild;
    parent.insertBefore(top, ref);
  }

  // Reverse the timeline items in place (at the first item's original spot).
  if (willReverse) {
    const anchor = (items[0] as Movable).__ghePlaceholder;
    if (anchor && anchor.parentNode) {
      const frag = document.createDocumentFragment();
      items
        .slice()
        .reverse()
        .forEach((e) => frag.appendChild(e));
      anchor.parentNode.insertBefore(frag, anchor);
    }
  }

  discussion.setAttribute(SIG, sig);
}
