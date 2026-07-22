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
// PR/issue description. On an already-minimized comment (expanded via its
// "Show comment" bar) the same button reads "Unhide" and submits GitHub's
// unminimize form instead — the mode is resolved at click time.

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

/**
 * Unhide a minimized comment by submitting GitHub's unminimize form. The
 * form lives in the "…" kebab menu, whose content is deferred-loaded — if
 * it isn't in the DOM yet, opening the menu makes GitHub fetch it.
 */
async function unhideComment(scope: Element, btn: HTMLButtonElement): Promise<void> {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Unhiding…';
  try {
    let form = scope.querySelector<HTMLFormElement>('form.js-comment-unminimize');
    if (!form) {
      const details = scope.querySelector<HTMLDetailsElement>(
        '.timeline-comment-actions details',
      );
      if (details && !details.open) details.querySelector('summary')?.click();
      form = await waitFor(
        () => scope.querySelector<HTMLFormElement>('form.js-comment-unminimize'),
        2000,
      );
      details?.removeAttribute('open'); // don't leave the menu showing
    }
    if (!form) throw new Error('no unminimize form found');

    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit(submit ?? undefined);
    } else {
      form.submit();
    }
  } catch (err) {
    console.debug('[github-enhance] unhide failed', err);
    btn.disabled = false;
    btn.textContent = original || 'Unhide';
    btn.title = 'Could not unhide automatically — use the “…” menu instead.';
  }
}

function makeButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = BTN_CLASS;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Resolve the mode at click time — the comment may have been hidden or
    // unhidden (and re-rendered) since the button was labelled.
    const minimized = btn.closest('.minimized-comment');
    if (minimized) {
      void unhideComment(minimized, btn);
      return;
    }
    const comment = btn.closest('.timeline-comment, .review-comment, .js-comment');
    if (comment) void hideAsOutdated(comment, btn);
  });
  return btn;
}

export function applyHideButtons(settings: Settings): void {
  const actionBars = document.querySelectorAll<HTMLElement>(
    '.timeline-comment-actions',
  );

  actionBars.forEach((actions) => {
    const existing = actions.querySelector<HTMLButtonElement>('.' + BTN_CLASS);

    if (!settings.hideComments.enabled) {
      existing?.remove();
      return;
    }

    const comment = actions.closest(
      '.timeline-comment, .review-comment, .js-comment',
    );
    const anchor = actions.closest(COMMENT_ANCHOR);

    if (!comment || !anchor) {
      existing?.remove();
      return;
    }

    const btn = existing ?? makeButton();
    if (!existing) actions.insertBefore(btn, actions.firstChild);

    // Inside a minimized comment the button unhides; elsewhere it hides.
    const mode = actions.closest('.minimized-comment') ? 'unhide' : 'hide';
    if (btn.dataset.gheMode !== mode && !btn.disabled) {
      btn.dataset.gheMode = mode;
      btn.textContent = mode === 'hide' ? 'Hide' : 'Unhide';
      btn.title =
        mode === 'hide' ? 'Hide this comment as outdated' : 'Unhide this comment';
    }
  });
}
