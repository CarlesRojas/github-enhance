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
//
// The proxy mirrors the original's state: it is shown only while GitHub
// itself is showing the control (visibility computed while ignoring our own
// hiding). A dedicated attribute observer keeps that in sync live — e.g.
// when a PR gets merged while the page is open, GitHub hides the control
// through style/attribute changes that produce no childList mutations, so
// the main observer alone would miss the transition until a reload.

import { Settings } from '../../shared/settings';
import { isPRPage, normText } from '../util';

const ATTR = 'data-ghe-redesign';
const HIDDEN_MARK = 'data-ghe-draft-hidden';
const SLOT_CLASS = 'ghe-draft-slot';

/**
 * GitHub's inline "Convert to draft" control — identified by the
 * "Still in progress?" lead-in sitting right next to it. That lead-in is what
 * distinguishes it from the confirmation dialog's own "Convert to draft"
 * footer button (which must never be touched), so this matches only the
 * inline block regardless of where it lives (below the checks box or in the
 * sidebar). Our proxy and anything inside a dialog are excluded outright.
 */
function findDraftButton(): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>('button, summary, a')) {
    if (el.closest('.' + SLOT_CLASS)) continue;
    if (el.closest('[role="dialog"], [role="alertdialog"], [class*="prc-Dialog"]')) continue;
    if (normText(el) !== 'convert to draft') continue;
    let anc: HTMLElement | null = el.parentElement;
    for (let i = 0; anc && i < 4; i++) {
      if ((anc.textContent || '').toLowerCase().includes('still in progress')) return el;
      anc = anc.parentElement;
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

/**
 * Whether GitHub itself is currently showing the control — computed by
 * walking up the ancestor chain and ignoring the block WE hid, so our own
 * hiding never counts as "GitHub hid it".
 */
function githubShowsControl(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node && node !== document.documentElement) {
    if (!node.hasAttribute(HIDDEN_MARK)) {
      const cs = getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    }
    node = node.parentElement;
  }
  return true;
}

/**
 * Merged / closed PRs can't be converted to draft — detected via the overall
 * mergeability icon's state token (purple `done` = merged, `closed` =
 * closed), which updates live when a PR gets merged while the page is open.
 */
function prMergedOrClosed(): boolean {
  return !!document.querySelector(
    '[class*="mergeabilityIcon"][style*="done"], [class*="mergeabilityIcon"][style*="closed"]',
  );
}

function applyDraftButton(on: boolean): void {
  const slot = document.querySelector<HTMLElement>('.' + SLOT_CLASS);

  // Mirror GitHub: no proxy unless GitHub currently shows the original
  // (missing entirely on draft PRs) and the PR is still open — after a live
  // merge the inline block may linger untouched in the DOM, so the state
  // icon is the reliable signal.
  const original = on && !prMergedOrClosed() ? findDraftButton() : null;
  if (!original || !githubShowsControl(original)) {
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

// --- Live sync -------------------------------------------------------------
// The content script's main observer only watches childList mutations, but
// GitHub can hide/show the original control by mutating style/class/hidden
// attributes. This dedicated observer re-evaluates the proxy on those.

let lastOn = false;
let draftObserver: MutationObserver | null = null;
let syncQueued = false;

function syncSoon(): void {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => {
    syncQueued = false;
    applyDraftButton(lastOn);
  });
}

function ensureDraftObserver(on: boolean): void {
  if (on && !draftObserver) {
    draftObserver = new MutationObserver(syncSoon);
    draftObserver.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden'],
    });
  } else if (!on && draftObserver) {
    draftObserver.disconnect();
    draftObserver = null;
  }
}

export function applyRedesign(settings: Settings): void {
  const on = settings.appearance.redesign && isPRPage();
  document.documentElement.toggleAttribute(ATTR, on);
  lastOn = on;
  ensureDraftObserver(on);
  applyDraftButton(on);
}
