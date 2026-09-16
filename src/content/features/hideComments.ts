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

/** Close a kebab menu we opened programmatically so it doesn't linger. */
function closeMenu(trigger: HTMLElement | null): void {
  if (!trigger) return;
  if (trigger instanceof HTMLDetailsElement) {
    trigger.removeAttribute('open');
    return;
  }
  // Primer <action-menu>: a button with popovertarget / aria-controls.
  const id = trigger.getAttribute('popovertarget') || trigger.getAttribute('aria-controls');
  const popover = id ? document.getElementById(id) : null;
  try {
    (popover as HTMLElement & { hidePopover?: () => void })?.hidePopover?.();
  } catch {
    /* not a popover */
  }
  if (trigger.getAttribute('aria-expanded') === 'true') trigger.click();
}

/**
 * Open the "…" kebab menu of a comment's action bar and return the element
 * that toggles it (the <details>, or the <button> of an <action-menu>) so the
 * caller can close it again. Returns null when no menu is found.
 */
function openMenu(actions: Element): HTMLElement | null {
  const details = actions.querySelector<HTMLDetailsElement>('details');
  if (details) {
    if (!details.open) details.querySelector<HTMLElement>('summary')?.click();
    return details;
  }
  const button = actions.querySelector<HTMLElement>(
    'button[popovertarget], button[aria-haspopup="true"], button[aria-haspopup="menu"]',
  );
  if (button) {
    if (button.getAttribute('aria-expanded') !== 'true') button.click();
    return button;
  }
  return null;
}

/** Find a menu item / button whose label matches `labels` (exact or prefix). */
function findMenuItem(root: ParentNode, labels: string[]): HTMLElement | null {
  const items = root.querySelectorAll<HTMLElement>(
    'button, a, [role="menuitem"], [role="menuitemradio"]',
  );
  for (const el of items) {
    const t = normText(el);
    if (labels.some((l) => t === l || t.startsWith(l + ' '))) return el;
  }
  return null;
}

async function hideViaMenu(comment: Element): Promise<boolean> {
  const actions = comment.querySelector(
    '.timeline-comment-actions, .timeline-comment-header',
  );
  if (!actions) return false;
  const trigger = openMenu(actions);
  if (!trigger) return false;

  try {
    // Find the "Hide" item and click it to reveal the reason form.
    const hideItem = await waitFor(() => findMenuItem(comment, ['hide']), 2000);
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
  } finally {
    closeMenu(trigger);
  }
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

const UNMINIMIZE_FORM =
  'form.js-comment-unminimize, form[action$="/unminimize"], form[action*="unminimize"]';

/**
 * The control that unhides a minimized comment: GitHub's unminimize form
 * when it is in the DOM, otherwise the "Unhide" item of the kebab menu
 * (whatever element it is rendered as — clicking it performs the action).
 */
function findUnhideControl(root: ParentNode): HTMLFormElement | HTMLElement | null {
  const form = root.querySelector<HTMLFormElement>(UNMINIMIZE_FORM);
  if (form) return form;
  return findMenuItem(root, ['unhide']);
}

function activate(control: HTMLFormElement | HTMLElement): void {
  if (!(control instanceof HTMLFormElement)) {
    control.click();
    return;
  }
  // A real click on the submit button goes through GitHub's own handlers
  // exactly like the user would; requestSubmit is the fallback.
  const submit = control.querySelector<HTMLButtonElement>(
    'button[type="submit"], button:not([type]), input[type="submit"]',
  );
  if (submit) {
    submit.click();
  } else if (typeof control.requestSubmit === 'function') {
    control.requestSubmit();
  } else {
    control.submit();
  }
}

/**
 * GitHub defers the kebab menu's content: <details-menu src="…"> pulls the
 * items (unminimize form included) only once the menu opens — and which menu
 * it serves depends on the URL's `minimized` flag. Fetch that fragment
 * ourselves, with the flag forced on, and lift the unminimize form out of it.
 */
async function fetchUnminimizeForm(scope: Element): Promise<HTMLFormElement | null> {
  const urls: string[] = [];
  for (const el of scope.querySelectorAll('details-menu[src], include-fragment[src]')) {
    const src = el.getAttribute('src');
    if (!src) continue;
    let forced = src;
    try {
      const u = new URL(src, location.href);
      u.searchParams.set('minimized', '1');
      forced = u.pathname + u.search;
    } catch {
      /* keep src as is */
    }
    for (const url of [forced, src]) if (!urls.includes(url)) urls.push(url);
  }
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        credentials: 'same-origin',
        headers: { Accept: 'text/html', 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (!res.ok) continue;
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const form = doc.querySelector<HTMLFormElement>(UNMINIMIZE_FORM);
      if (form) return document.importNode(form, true);
    } catch (err) {
      console.debug('[github-enhance] menu fetch failed', url, err);
    }
  }
  return null;
}

/**
 * Unhide a minimized comment by submitting GitHub's unminimize form. Looked
 * for in the DOM first; otherwise fetched from the kebab menu's source URL
 * and mounted (hidden) inside the comment so GitHub's own submit handling
 * runs on it. Only if both fail is the kebab menu opened as a last resort,
 * and it is closed again afterwards whatever happens.
 */
async function unhideComment(scope: Element, btn: HTMLButtonElement): Promise<void> {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Unhiding…';
  let trigger: HTMLElement | null = null;
  try {
    let control: HTMLElement | null = findUnhideControl(scope);
    if (!control) {
      const form = await fetchUnminimizeForm(scope);
      if (form) {
        const host = document.createElement('div');
        host.hidden = true;
        host.className = 'ghe-unminimize-host';
        host.appendChild(form);
        (btn.closest('.timeline-comment-actions') ?? scope).appendChild(host);
        control = form;
      }
    }
    if (!control) {
      // Prefer the kebab next to our button; fall back to any in the comment.
      const actions =
        btn.closest('.timeline-comment-actions') ??
        scope.querySelector('.timeline-comment-actions') ??
        scope;
      trigger = openMenu(actions);
      if (!trigger) throw new Error('no kebab menu found');
      control = await waitFor(() => findUnhideControl(scope), 3000);
    }
    if (!control) throw new Error('no unminimize form or Unhide item found');
    activate(control);
  } catch (err) {
    console.debug('[github-enhance] unhide failed', err);
    btn.disabled = false;
    btn.textContent = original || 'Unhide';
    btn.title = 'Could not unhide automatically — use the “…” menu instead.';
  } finally {
    closeMenu(trigger);
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
