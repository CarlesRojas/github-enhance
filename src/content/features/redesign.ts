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

/** GitHub's own "Convert to draft" control (never our proxy). */
function findDraftButton(): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>('button, summary, a')) {
    if (el.closest('.' + SLOT_CLASS)) continue;
    if (normText(el) === 'convert to draft') return el;
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

function applyDraftButton(on: boolean): void {
  const slot = document.querySelector<HTMLElement>('.' + SLOT_CLASS);
  const hidden = document.querySelector<HTMLElement>(`[${HIDDEN_MARK}]`);

  if (!on) {
    slot?.remove();
    if (hidden) {
      hidden.style.removeProperty('display');
      hidden.removeAttribute(HIDDEN_MARK);
    }
    return;
  }

  // No original control (e.g. the PR is already a draft) — nothing to proxy.
  const original = findDraftButton();
  if (!original) {
    slot?.remove();
    return;
  }

  // Hide the original block along with its "Still in progress?" text.
  const wrapper = draftWrapper(original);
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
