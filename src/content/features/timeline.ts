// Feature 4 (experimental): reorder the pull-request conversation so it reads
// newest-activity-first, with the compose box near the top.
//
// Target top-to-bottom order when enabled:
//   1. Description  (the first comment — stays at the top, untouched)
//   2. Checks / merge box
//   3. "Add a comment" box
//   4. The rest of the timeline, reversed (newest first)
//
// Every node we move first drops a placeholder comment at its original spot,
// so disabling the feature can put everything back without a reload.

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

function isDescription(child: Element, index: number): boolean {
  // The first child that actually contains a comment body is the PR/issue
  // description.
  return index === 0 && !!child.querySelector('.comment-body, .timeline-comment');
}

export function resetTimeline(): void {
  const discussion = document.querySelector<HTMLElement>('.js-discussion');
  document.querySelectorAll<Movable>(`[${MOVED}="1"]`).forEach((node) => {
    const ph = node.__ghePlaceholder;
    if (ph && ph.parentElement) {
      ph.parentElement.insertBefore(node, ph);
      ph.remove();
    }
    node.__ghePlaceholder = undefined;
    node.removeAttribute(MOVED);
  });
  discussion?.removeAttribute(FLAG);
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

  const bucket =
    discussion.closest<HTMLElement>('#discussion_bucket') ||
    discussion.parentElement;
  if (!bucket) return;

  // The "checks / merge status" box and the compose box. Bail until at least
  // one is present, so we don't lock in an order before the page has loaded.
  const mergeBox = bucket.querySelector<HTMLElement>('#partial-pull-merging');
  const commentForm =
    bucket.querySelector<HTMLElement>('.discussion-timeline-actions') ||
    (document
      .querySelector('#new_comment_field, .js-new-comment-form')
      ?.closest<HTMLElement>(
        '.discussion-timeline-actions, .timeline-comment-wrapper, .js-comment-container',
      ) ??
      null);

  if (!mergeBox && !commentForm) return;

  // Anything we might move must not be an ancestor of the discussion list.
  const safe = (n: HTMLElement | null): n is HTMLElement =>
    !!n && n !== discussion && !n.contains(discussion);

  const children = Array.from(discussion.children) as HTMLElement[];
  const description = children.find((c, i) => isDescription(c, i)) || null;

  const timelineItems = children.filter((c, i) => {
    if (isDescription(c, i)) return false;
    if (safe(mergeBox) && (c === mergeBox || c.contains(mergeBox))) return false;
    if (safe(commentForm) && (c === commentForm || c.contains(commentForm))) return false;
    return true;
  });

  // Record original positions before moving anything.
  [mergeBox, commentForm, ...timelineItems].forEach((n) => {
    if (safe(n)) markOrigin(n);
  });

  const fragment = document.createDocumentFragment();
  if (safe(mergeBox)) fragment.appendChild(mergeBox);
  if (safe(commentForm)) fragment.appendChild(commentForm);
  timelineItems.reverse().forEach((item) => fragment.appendChild(item));

  if (description && description.parentElement === discussion) {
    description.after(fragment);
  } else {
    discussion.appendChild(fragment);
  }

  discussion.setAttribute(FLAG, '1');
}
