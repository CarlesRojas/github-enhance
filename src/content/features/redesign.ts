// Appearance: the pull-request page redesign, behind a single toggle.
//
// The content script flips one attribute on <html> — visual changes live in
// content.css under `html[data-ghe-redesign]`, expressed with GitHub's own
// color tokens so all native themes work automatically. Applied only on
// pull-request pages, and cleared on soft (Turbo) navigation away.
//
// It also relocates two author actions into the checks card as proxy buttons
// that forward clicks to GitHub's originals (which are hidden, NOT removed, so
// React / form handlers stay alive). They share one right-aligned slot:
//   • "Close / Reopen pull request" (left) — from below the comment box,
//     behind its own setting.
//   • "Convert to draft" (right) — from its "Still in progress?" block, part
//     of the redesign itself.
//
// Both proxies mirror their originals' live state. GitHub toggles these
// controls through style/attribute changes, and swaps the socket-updated
// comment-actions bar (Close ⇄ Reopen), in ways the main childList observer
// can miss — so a dedicated attribute observer re-syncs on those too.

import { Settings } from '../../shared/settings';
import { isPRPage, normText } from '../util';

const ATTR = 'data-ghe-redesign';
const DRAFT_HIDDEN = 'data-ghe-draft-hidden';
const CLOSE_HIDDEN = 'data-ghe-close-hidden';
const SLOT_CLASS = 'ghe-draft-slot';
const DRAFT_BTN_CLASS = 'ghe-draft-btn';
const CLOSE_BTN_CLASS = 'ghe-close-btn';

/** The checks card that hosts the relocated action buttons. */
function findChecksBox(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '[data-testid="mergebox-partial"] .border, #partial-pull-merging .branch-action-item',
  );
}

/** The right-aligned flex row holding the proxy buttons; created on demand. */
function ensureSlot(box: HTMLElement): HTMLElement {
  let slot = document.querySelector<HTMLElement>('.' + SLOT_CLASS);
  if (slot && !box.contains(slot)) {
    slot.remove();
    slot = null;
  }
  if (!slot) {
    slot = document.createElement('div');
    slot.className = SLOT_CLASS;
    box.appendChild(slot);
  }
  return slot;
}

/** Reveal an element we hid, and drop its marker. */
function clearHide(el: HTMLElement, mark: string): void {
  el.style.removeProperty('display');
  el.removeAttribute(mark);
}

function clearAllHidden(mark: string): void {
  document.querySelectorAll<HTMLElement>(`[${mark}]`).forEach((el) => clearHide(el, mark));
}

/** Hide `wrapper` (display:none + marker), healing any other stale marks. */
function hideOnly(wrapper: HTMLElement, mark: string): void {
  document.querySelectorAll<HTMLElement>(`[${mark}]`).forEach((el) => {
    if (el !== wrapper) clearHide(el, mark);
  });
  if (!wrapper.hasAttribute(mark)) {
    wrapper.setAttribute(mark, '');
    wrapper.style.setProperty('display', 'none', 'important');
  }
}

// --- Convert to draft ------------------------------------------------------

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

/**
 * Whether GitHub itself is currently showing the control — computed by
 * walking up the ancestor chain and ignoring the block WE hid, so our own
 * hiding never counts as "GitHub hid it".
 */
function githubShowsControl(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node && node !== document.documentElement) {
    if (!node.hasAttribute(DRAFT_HIDDEN)) {
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

/** Add the draft proxy as the slot's right-most button (once). */
function ensureDraftBtn(slot: HTMLElement): void {
  if (slot.querySelector(':scope > .' + DRAFT_BTN_CLASS)) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = DRAFT_BTN_CLASS;
  btn.textContent = 'Convert to draft';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    // Resolve at click time — React may have re-rendered the original.
    findDraftButton()?.click();
  });
  slot.appendChild(btn);
}

// --- Close / Reopen --------------------------------------------------------

/**
 * The author-only "Close / Reopen pull request" submit button below the
 * comment box. The same .js-comment-and-button class serves both states; the
 * name (comment_and_close / comment_and_open) distinguishes them. Anything
 * inside a dialog is excluded.
 */
function findCloseButton(): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(
    'button.js-comment-and-button[name="comment_and_close"], button.js-comment-and-button[name="comment_and_open"]',
  )) {
    if (el.closest('[role="dialog"], [role="alertdialog"], [class*="prc-Dialog"]')) continue;
    return el;
  }
  return null;
}

/**
 * The stable label ("Close pull request" / "Reopen pull request"), taken from
 * the button's default action text so the proxy doesn't flip to the
 * "…with comment" variant GitHub swaps in once the comment box has text.
 */
function closeLabel(btn: HTMLElement): string {
  const span = btn.querySelector<HTMLElement>('.js-form-action-text');
  return (
    span?.getAttribute('data-default-action-text') ||
    span?.textContent?.trim() ||
    btn.textContent?.trim() ||
    'Close pull request'
  );
}

/** Add / keep the close proxy as the slot's left-most button, with `label`. */
function ensureCloseBtn(slot: HTMLElement, label: string): void {
  let btn = slot.querySelector<HTMLButtonElement>(':scope > .' + CLOSE_BTN_CLASS);
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = CLOSE_BTN_CLASS;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      // Resolve at click time — the socket-updated bar swaps the original.
      findCloseButton()?.click();
    });
  }
  if (slot.firstElementChild !== btn) slot.prepend(btn); // keep it left of draft
  if (btn.textContent !== label) btn.textContent = label;
}

// --- Apply -----------------------------------------------------------------

function applyProxies(on: boolean, closeOn: boolean): void {
  const box = findChecksBox();

  const draftOriginal = on && !prMergedOrClosed() ? findDraftButton() : null;
  const showDraft = !!draftOriginal && githubShowsControl(draftOriginal);

  const closeOriginal = on && closeOn ? findCloseButton() : null;
  const showClose = !!closeOriginal;

  // Nothing to relocate (or nowhere to put it) → tear everything down.
  if (!box || (!showDraft && !showClose)) {
    document.querySelector('.' + SLOT_CLASS)?.remove();
    clearAllHidden(DRAFT_HIDDEN);
    clearAllHidden(CLOSE_HIDDEN);
    return;
  }

  const slot = ensureSlot(box);

  if (showDraft && draftOriginal) {
    hideOnly(draftWrapper(draftOriginal), DRAFT_HIDDEN);
    ensureDraftBtn(slot);
  } else {
    clearAllHidden(DRAFT_HIDDEN);
    slot.querySelector(':scope > .' + DRAFT_BTN_CLASS)?.remove();
  }

  if (showClose && closeOriginal) {
    // Hide just the button's own .color-bg-subtle box, leaving the adjacent
    // Comment button in place.
    hideOnly(closeOriginal.closest<HTMLElement>('.color-bg-subtle') ?? closeOriginal, CLOSE_HIDDEN);
    ensureCloseBtn(slot, closeLabel(closeOriginal));
  } else {
    clearAllHidden(CLOSE_HIDDEN);
    slot.querySelector(':scope > .' + CLOSE_BTN_CLASS)?.remove();
  }
}

// --- Live sync -------------------------------------------------------------
// The content script's main observer only watches childList mutations, but
// GitHub can hide/show these controls by mutating style/class/hidden
// attributes. This dedicated observer re-evaluates the proxies on those.

let lastOn = false;
let lastCloseOn = false;
let syncObserver: MutationObserver | null = null;
let syncQueued = false;

function syncSoon(): void {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => {
    syncQueued = false;
    applyProxies(lastOn, lastCloseOn);
  });
}

function ensureObserver(on: boolean): void {
  if (on && !syncObserver) {
    syncObserver = new MutationObserver(syncSoon);
    syncObserver.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden'],
    });
  } else if (!on && syncObserver) {
    syncObserver.disconnect();
    syncObserver = null;
  }
}

export function applyRedesign(settings: Settings): void {
  const on = settings.appearance.redesign && isPRPage();
  document.documentElement.toggleAttribute(ATTR, on);
  lastOn = on;
  lastCloseOn = settings.layout.closeInChecks;
  ensureObserver(on);
  applyProxies(on, lastCloseOn);
}
