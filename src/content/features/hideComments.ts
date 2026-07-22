// Feature 3: add a "Hide" button to the right of every pull-request comment
// that minimizes it as "Outdated" — the same result as the
// "… → Hide → Outdated" menu flow.
//
// Two strategies, tried in order:
//   1. Submit the comment's inline minimize form directly (GitHub ships it in
//      the DOM for hideable comments). This is the reliable path.
//   2. Fall back to driving the "…" kebab menu → "Hide" → pick reason →
//      submit, waiting for each async bit to appear.
//
// The button is only added to real, hideable comments (those with an
// issuecomment / review-comment anchor), which conveniently excludes the
// PR/issue description, and never to already-minimized comments.

import { Settings } from '../../shared/settings';
import { waitFor, normText } from '../util';

const BTN_CLASS = 'ghe-hide-btn';
const REASON = 'OUTDATED';

const COMMENT_ANCHOR =
  '[id^="issuecomment-"], [id^="discussion_r"], [id^="pullrequestreview-"]';

function pickOutdatedOption(select: HTMLSelectElement): void {
  const byValue = Array.from(select.options).find(
    (o) => o.value.toUpperCase() === REASON,
  );
  const byText = Array.from(select.options).find((o) =>
    normText(o).includes('outdated'),
  );
  const chosen = byValue || byText;
  if (chosen) select.value = chosen.value;
}

function submitInlineForm(comment: Element): boolean {
  const form = comment.querySelector<HTMLFormElement>(
    'form.js-comment-minimize, form[action$="/minimize"], form[action*="minimize"]',
  );
  if (!form) return false;

  const select = form.querySelector<HTMLSelectElement>(
    'select[name="classifier"], select.js-comment-minimize-reasons, select',
  );
  if (select) pickOutdatedOption(select);

  const submit = form.querySelector<HTMLElement>(
    'button[type="submit"], input[type="submit"], [data-disable-with]',
  );
  // requestSubmit's submitter must be a submit button; otherwise submit
  // without one (the form still posts, just without that button's value).
  const submitter =
    submit && submit.tagName === 'BUTTON' ? (submit as HTMLButtonElement) : undefined;
  if (typeof form.requestSubmit === 'function') {
    form.requestSubmit(submitter);
  } else {
    form.submit();
  }
  return true;
}

async function hideViaMenu(comment: Element): Promise<boolean> {
  const details = comment.querySelector<HTMLDetailsElement>(
    '.timeline-comment-actions details, .timeline-comment-header details',
  );
  const summary = details?.querySelector<HTMLElement>('summary');
  if (!details || !summary) return false;

  if (!details.open) summary.click();

  const menu = await waitFor(
    () => details.querySelector('details-menu, .dropdown-menu, .SelectMenu-list'),
    2000,
  );
  if (!menu) return false;

  // Find the "Hide" item and click it to reveal the reason form.
  const hideItem = Array.from(
    menu.querySelectorAll<HTMLElement>('button, a, [role="menuitem"]'),
  ).find((el) => {
    const t = normText(el);
    return t === 'hide' || t.startsWith('hide ');
  });
  if (!hideItem) return false;
  hideItem.click();

  // The inline form should now exist somewhere in the comment.
  const form = await waitFor(
    () =>
      comment.querySelector<HTMLFormElement>(
        'form.js-comment-minimize, form[action*="minimize"]',
      ),
    2000,
  );
  if (form && submitInlineForm(comment)) return true;

  // Otherwise pick the reason from a select that just appeared and submit.
  const select = await waitFor(
    () =>
      comment.querySelector<HTMLSelectElement>(
        'select[name="classifier"], select.js-comment-minimize-reasons',
      ),
    2000,
  );
  if (!select) return false;
  pickOutdatedOption(select);
  const submit = select
    .closest('form')
    ?.querySelector<HTMLElement>('button[type="submit"], input[type="submit"]');
  submit?.click();
  return true;
}

async function hideAsOutdated(comment: Element, btn: HTMLButtonElement): Promise<void> {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Hiding…';
  try {
    if (submitInlineForm(comment)) return;
    if (await hideViaMenu(comment)) return;
    throw new Error('no minimize form found');
  } catch (err) {
    console.debug('[github-enhance] hide failed', err);
    btn.disabled = false;
    btn.textContent = original || 'Hide';
    btn.title = 'Could not hide automatically — use the “…” menu instead.';
  }
}

function makeButton(comment: Element): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = BTN_CLASS;
  btn.textContent = 'Hide';
  btn.title = 'Hide this comment as outdated';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void hideAsOutdated(comment, btn);
  });
  return btn;
}

export function applyHideButtons(settings: Settings): void {
  const actionBars = document.querySelectorAll<HTMLElement>(
    '.timeline-comment-actions',
  );

  actionBars.forEach((actions) => {
    const existing = actions.querySelector<HTMLElement>('.' + BTN_CLASS);

    if (!settings.hideComments.enabled) {
      existing?.remove();
      return;
    }

    const comment = actions.closest(
      '.timeline-comment, .review-comment, .js-comment',
    );
    const anchor = actions.closest(COMMENT_ANCHOR);
    const minimized =
      comment?.classList.contains('minimized-comment') ||
      !!comment?.querySelector('.minimized-comment');

    if (!comment || !anchor || minimized) {
      existing?.remove();
      return;
    }

    if (!existing) {
      actions.insertBefore(makeButton(comment), actions.firstChild);
    }
  });
}
