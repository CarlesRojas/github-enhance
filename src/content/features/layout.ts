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
// Inverting also, in the timeline order:
//   • reverses grouped deployment rows inside the ".merge-status-list" lists
//     (GitHub packs several deployments into one row list), and
//   • lifts the "deployments box" ("This branch was successfully deployed") to
//     sit right above the newest timeline item, with its divider flipped to the
//     bottom.
//
// Every moved node leaves a placeholder at its original spot. The whole thing
// reconciles from a clean slate whenever the desired arrangement changes, so
// any combination of toggles restores correctly without a reload.

import { Settings } from '../../shared/settings';

const SIG = 'data-ghe-layout';
const MOVED = 'data-ghe-moved';
const DEPLOY_TOP = 'ghe-deploy-top';

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

/** Reverse a set of sibling nodes in place, at the first node's position. */
function reverseInPlace(nodes: HTMLElement[]): void {
  if (nodes.length < 2) return;
  nodes.forEach(markOrigin);
  const anchor = (nodes[0] as Movable).__ghePlaceholder;
  if (!anchor || !anchor.parentNode) return;
  const frag = document.createDocumentFragment();
  nodes
    .slice()
    .reverse()
    .forEach((n) => frag.appendChild(n));
  anchor.parentNode.insertBefore(frag, anchor);
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
  document.querySelectorAll('.' + DEPLOY_TOP).forEach((el) => el.classList.remove(DEPLOY_TOP));
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

/**
 * The "Add a comment" composer only — NOT other people's / CI comments. The
 * new-comment box carries the specific `.timeline-new-comment` class; the
 * generic `.timeline-comment-wrapper` / `.js-comment-container` wrap every
 * comment, so we never fall back to those.
 */
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

/** The "This branch was successfully deployed" box. */
function findDeploymentsBox(): HTMLElement | null {
  const wrapper = document.querySelector<HTMLElement>('[data-url*="deployments_box"]');
  return wrapper?.closest<HTMLElement>('.branch-action') ?? null;
}

/** Reverse grouped deployment rows within each `.merge-status-list`. */
function reverseDeployRows(discussion: HTMLElement): void {
  discussion.querySelectorAll<HTMLElement>('.merge-status-list').forEach((list) => {
    if (list.closest('.comment-body, .markdown-body')) return;
    const rows = Array.from(list.children).filter((c) =>
      /deployed/i.test(c.textContent || ''),
    ) as HTMLElement[];
    if (rows.length >= 2) reverseInPlace(rows);
  });
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

  // Nothing actionable yet (e.g. page still loading) — leave sig unset to retry.
  if (!safe(mergeBox) && !safe(composeBox) && !willReverse) return;

  // Move checks/compose to just after the description (checks first).
  if (safe(mergeBox)) markOrigin(mergeBox);
  if (safe(composeBox)) markOrigin(composeBox);
  if (safe(mergeBox) || safe(composeBox)) {
    const top = document.createDocumentFragment();
    if (safe(mergeBox)) top.appendChild(mergeBox);
    if (safe(composeBox)) top.appendChild(composeBox);
    const parent = description?.parentElement ?? discussion;
    const ref = description ? description.nextSibling : discussion.firstChild;
    parent.insertBefore(top, ref);
  }

  // Reverse the timeline items, then the grouped deployment rows within them.
  if (willReverse) {
    reverseInPlace(items);
    reverseDeployRows(discussion);

    // Lift the deployments box above the (now newest-first) timeline.
    const box = findDeploymentsBox();
    const firstItem = items[items.length - 1]; // newest, now topmost
    if (safe(box) && firstItem.parentNode) {
      markOrigin(box);
      box.classList.add(DEPLOY_TOP);
      firstItem.parentNode.insertBefore(box, firstItem);
    }
  }

  discussion.setAttribute(SIG, sig);
}
