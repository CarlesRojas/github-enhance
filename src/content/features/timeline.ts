// Feature 4 (experimental): reorder the pull-request conversation to read
// newest-first, with the compose box near the top.
//
// Target top-to-bottom order when enabled:
//   1. Description   (the first comment — stays put at the top)
//   2. Checks / merge box
//   3. "Add a comment" box
//   4. The rest of the timeline, reversed (newest first)
//
// Timeline entries are GitHub's `.js-timeline-item` elements, found anywhere
// under `.js-discussion` (they're often nested), so reordering doesn't depend
// on them being direct children. Every moved node leaves a placeholder at its
// original spot, so disabling the feature restores the page without a reload.

import { Settings } from '../../shared/settings';

const FLAG = 'data-ghe-timeline';
const MOVED = 'data-ghe-moved';

interface Movable extends HTMLElement {
  __ghePlaceholder?: Comment;
}

function markOrigin(node: Movable): void {
  if (node.getAttribute(MOVED) === '1') return;
  const placeholder = document.createComment('ghe-timeline-placeholder');
  node.parentElement?.insertBefore(placeholder, node);
  node.__ghePlaceholder = placeholder;
  node.setAttribute(MOVED, '1');
}

export function resetTimeline(): void {
  document.querySelectorAll<Movable>(`[${MOVED}="1"]`).forEach((node) => {
    const ph = node.__ghePlaceholder;
    if (ph && ph.parentElement) {
      ph.parentElement.insertBefore(node, ph);
      ph.remove();
    }
    node.__ghePlaceholder = undefined;
    node.removeAttribute(MOVED);
  });
  document.querySelector('.js-discussion')?.removeAttribute(FLAG);
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

export function applyTimeline(settings: Settings): void {
  const discussion = document.querySelector<HTMLElement>('.js-discussion');
  if (!discussion) return;

  const applied = discussion.getAttribute(FLAG) === '1';
  if (!settings.timeline.enabled) {
    if (applied) resetTimeline();
    return;
  }
  if (applied) return; // Already reordered this page — idempotent.

  // Nothing we move may be an ancestor of the discussion list.
  const safe = (n: HTMLElement | null): n is HTMLElement =>
    !!n && n !== discussion && !n.contains(discussion);

  const description = descriptionEntry(discussion);
  const entries = Array.from(
    discussion.querySelectorAll<HTMLElement>('.js-timeline-item'),
  );
  const reverseSet = entries.filter(
    (e) =>
      e !== description &&
      !(description && (e.contains(description) || description.contains(e))),
  );

  const mergeBox = findMergeBox();
  const composeBox = findComposeBox();

  // Nothing worth doing yet (e.g. page still loading) — try again next pass.
  if (reverseSet.length < 2 && !safe(mergeBox) && !safe(composeBox)) return;

  // Record original positions before moving anything (enables restore).
  if (safe(mergeBox)) markOrigin(mergeBox);
  if (safe(composeBox)) markOrigin(composeBox);
  reverseSet.forEach((e) => safe(e) && markOrigin(e));

  // Build the new block: [checks] [compose] [reversed timeline].
  const fragment = document.createDocumentFragment();
  if (safe(mergeBox)) fragment.appendChild(mergeBox);
  if (safe(composeBox)) fragment.appendChild(composeBox);
  reverseSet
    .slice()
    .reverse()
    .forEach((e) => safe(e) && fragment.appendChild(e));

  // Insert right after the description, wherever the description lives.
  const parent = description?.parentElement ?? discussion;
  const ref = description ? description.nextSibling : discussion.firstChild;
  parent.insertBefore(fragment, ref);

  discussion.setAttribute(FLAG, '1');
}
