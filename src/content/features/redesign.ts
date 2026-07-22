// Appearance: the pull-request page redesign, behind a single toggle.
//
// The content script flips one attribute on <html> — visual changes live in
// content.css under `html[data-ghe-redesign]`, expressed with GitHub's own
// color tokens so all native themes work automatically. Applied only on
// pull-request pages, and cleared on soft (Turbo) navigation away.
//
// It also relocates the "Convert to draft" action: the original block
// ("Still in progress? Convert to draft") is hidden — NOT removed, so
// GitHub's React handlers stay alive — and a proxy button in the checks
// card's bottom-right forwards clicks to the hidden original.

import { Settings } from '../../shared/settings';
import { isPRPage, normText } from '../util';

const ATTR = 'data-ghe-redesign';
const HIDDEN_MARK = 'data-ghe-draft-hidden';
const SLOT_CLASS = 'ghe-draft-slot';

/**
 * Only these places may contain the control we relocate: the PR sidebar and
 * the area around the checks / merge box. Never dialogs — the convert
 * confirmation modal has its own "Convert to draft" button that must stay.
 */
function searchRoots(): HTMLElement[] {
  const roots: HTMLElement[] = [];
  for (const sel of [
    '#pr-conversation-sidebar',
    '#partial-discussion-sidebar',
    '.Layout-sidebar',
  ]) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) roots.push(el);
  }
  const merge = document.querySelector<HTMLElement>(
    '[data-testid="mergebox-partial"], #partial-pull-merging',
  );
  if (merge?.parentElement) roots.push(merge.parentElement);
  return roots;
}

/** GitHub's own "Convert to draft" control (never our proxy, never a dialog's). */
function findDraftButton(): HTMLElement | null {
  for (const root of searchRoots()) {
    for (const el of root.querySelectorAll<HTMLElement>('button, summary, a')) {
      if (el.closest('.' + SLOT_CLASS)) continue;
      if (el.closest('[role="dialog"], [role="alertdialog"], [class*="prc-Dialog"]')) continue;
      if (normText(el) === 'convert to draft') return el;
    }
  }
  return null;
}

/** The block to hide: the ancestor holding the "Still in progress?" text. */
function draftWrapper(btn: HTMLElement): HTMLElement {
  let el: HTMLElement | null = btn.parentElement;
  for (let i = 0; el && i < 4; i++) {
    if ((el.textContent || '').toLowerCase().includes('still in progress')) return el;
    el = el.parentElement;
  }
  return btn.parentElement ?? btn;
}

function unhide(el: HTMLElement): void {
  el.style.removeProperty('display');
  el.removeAttribute(HIDDEN_MARK);
}

function applyDraftButton(on: boolean): void {
  const slot = document.querySelector<HTMLElement>('.' + SLOT_CLASS);

  if (!on) {
    slot?.remove();
    document.querySelectorAll<HTMLElement>(`[${HIDDEN_MARK}]`).forEach(unhide);
    return;
  }

  // No original control (e.g. the PR is already a draft) — nothing to proxy.
  const original = findDraftButton();
  if (!original) {
    slot?.remove();
    document.querySelectorAll<HTMLElement>(`[${HIDDEN_MARK}]`).forEach(unhide);
    return;
  }

  // Hide the original block along with its "Still in progress?" text, and
  // heal any stale marks (e.g. a dialog's confirm button caught previously).
  const wrapper = draftWrapper(original);
  document.querySelectorAll<HTMLElement>(`[${HIDDEN_MARK}]`).forEach((el) => {
    if (el !== wrapper) unhide(el);
  });
  if (!wrapper.hasAttribute(HIDDEN_MARK)) {
    wrapper.setAttribute(HIDDEN_MARK, '');
    wrapper.style.setProperty('display', 'none', 'important');
  }

  // Proxy button at the bottom of the checks card.
  const box = document.querySelector<HTMLElement>(
    '[data-testid="mergebox-partial"] .border, #partial-pull-merging .branch-action-item',
  );
  if (!box) return;
  if (slot && box.contains(slot)) return; // already in place
  slot?.remove();

  const div = document.createElement('div');
  div.className = SLOT_CLASS;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ghe-draft-btn';
  btn.textContent = 'Convert to draft';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    // Resolve at click time — React may have re-rendered the original.
    findDraftButton()?.click();
  });
  div.appendChild(btn);
  box.appendChild(div);
}

export function applyRedesign(settings: Settings): void {
  const on = settings.appearance.redesign && isPRPage();
  document.documentElement.toggleAttribute(ATTR, on);
  applyDraftButton(on);
}
