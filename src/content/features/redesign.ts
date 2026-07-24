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
const DESTRUCTIVE_CLASS = 'ghe-destructive'; // red danger styling for Close
const LOADING_CLASS = 'ghe-loading'; // spinner while the action is in flight
const LABEL_CLASS = 'ghe-btn-label'; // wraps the proxy's text (icon sits beside)
const CLOSE_ICON_CLASS = 'ghe-close-icon'; // the closed-PR octicon on Close

/** GitHub's git-pull-request-closed octicon, shown on the Close proxy. */
function buildCloseIcon(): SVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', CLOSE_ICON_CLASS);
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'currentColor');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute(
    'd',
    'M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 5.5a.75.75 0 0 1 .75.75v3.378a2.251 2.251 0 1 1-1.5 0V7.25a.75.75 0 0 1 .75-.75Zm-2.03-5.273a.75.75 0 0 1 1.06 0l.97.97.97-.97a.748.748 0 0 1 1.265.332.75.75 0 0 1-.205.729l-.97.97.97.97a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018l-.97-.97-.97.97a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l.97-.97-.97-.97a.75.75 0 0 1 0-1.06ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z',
  );
  svg.appendChild(path);
  return svg;
}

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
  }
  // Keep it pinned to the bottom of the card. GitHub re-renders the mergebox
  // after a close/reopen and can mount its new content after our slot, leaving
  // it stranded at the top — so re-append it whenever it isn't already last.
  if (box.lastElementChild !== slot) box.appendChild(slot);
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
    if (btn.classList.contains(LOADING_CLASS)) return;
    draftPending = true; // survive the mergebox re-render mid-conversion
    setLoading(btn); // cleared when the control goes away (converted) or reload
    // Resolve at click time — React may have re-rendered the original.
    findDraftButton()?.click();
  });
  slot.appendChild(btn);
}

// --- Loading state ---------------------------------------------------------
// On click, a proxy shows a spinner (the label is hidden, interaction blocked)
// until the action lands: a close/reopen flips the button's label, a draft
// conversion removes the control, and either way a reload wipes it. A single
// failsafe timer clears a stuck spinner if none of that happens.

let loadTimer = 0;
// The draft toggle re-renders the mergebox, which can recreate our button
// mid-action and drop the spinner. This intent flag re-asserts it until the
// control goes away (converted) or the failsafe fires.
let draftPending = false;

function setLoading(btn: HTMLElement): void {
  if (btn.classList.contains(LOADING_CLASS)) return;
  btn.classList.add(LOADING_CLASS);
  btn.setAttribute('aria-busy', 'true');
  clearTimeout(loadTimer);
  loadTimer = window.setTimeout(clearAllLoading, 12000);
}

function clearLoading(btn: HTMLElement): void {
  btn.classList.remove(LOADING_CLASS);
  btn.removeAttribute('aria-busy');
  delete btn.dataset.gheLoadingLabel;
}

function clearAllLoading(): void {
  draftPending = false;
  document.querySelectorAll<HTMLElement>('.' + LOADING_CLASS).forEach(clearLoading);
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

/**
 * Add / keep the close proxy as the slot's left-most button, mirroring the
 * original's label, disabled state, and — when disabled — the reason GitHub
 * shows on hover (e.g. "The … branch has been deleted.").
 *
 * The proxy is marked aria-disabled rather than truly `disabled`: a disabled
 * button can't be hovered/focused for events, and the reason is shown through
 * a page-level tooltip (see showTip) that needs those events. The click
 * handler bails when aria-disabled, so it still can't act.
 */
function ensureCloseBtn(slot: HTMLElement, original: HTMLElement): void {
  let btn = slot.querySelector<HTMLButtonElement>(':scope > .' + CLOSE_BTN_CLASS);
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = CLOSE_BTN_CLASS;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const b = e.currentTarget as HTMLElement;
      if (b.getAttribute('aria-disabled') === 'true' || b.classList.contains(LOADING_CLASS)) return;
      // Remember the label so we can clear the spinner once the state flips.
      b.dataset.gheLoadingLabel = b.textContent ?? '';
      setLoading(b);
      // Resolve at click time — the socket-updated bar swaps the original.
      findCloseButton()?.click();
    });
    btn.addEventListener('mouseenter', (e) => showTipFor(e.currentTarget as HTMLElement));
    btn.addEventListener('focus', (e) => showTipFor(e.currentTarget as HTMLElement));
    btn.addEventListener('mouseleave', hideTip);
    btn.addEventListener('blur', hideTip);
  }
  if (slot.firstElementChild !== btn) slot.prepend(btn); // keep it left of draft

  const label = closeLabel(original);
  // The action landed once the label flips (Close ⇄ Reopen) — drop the spinner.
  if (
    btn.classList.contains(LOADING_CLASS) &&
    btn.dataset.gheLoadingLabel !== undefined &&
    btn.dataset.gheLoadingLabel !== label
  ) {
    clearLoading(btn);
  }

  // Content is a label span plus an optional leading icon, so the spinner and
  // the label can coexist without setting textContent (which would drop the
  // icon).
  let labelEl = btn.querySelector<HTMLElement>(':scope > .' + LABEL_CLASS);
  if (!labelEl) {
    labelEl = document.createElement('span');
    labelEl.className = LABEL_CLASS;
    btn.appendChild(labelEl);
  }
  if (labelEl.textContent !== label) labelEl.textContent = label;

  // Only Close is destructive, and only Close carries the closed-PR icon;
  // Reopen keeps the neutral styling and no icon (matching GitHub).
  const destructive = original.getAttribute('name') === 'comment_and_close';
  if (btn.classList.contains(DESTRUCTIVE_CLASS) !== destructive) {
    btn.classList.toggle(DESTRUCTIVE_CLASS, destructive);
  }
  const icon = btn.querySelector(':scope > .' + CLOSE_ICON_CLASS);
  if (destructive && !icon) {
    btn.insertBefore(buildCloseIcon(), btn.firstChild);
  } else if (!destructive && icon) {
    icon.remove();
  }

  const reason = original.hasAttribute('disabled') ? original.getAttribute('aria-label') : null;
  if (reason) {
    if (btn.getAttribute('aria-disabled') !== 'true') btn.setAttribute('aria-disabled', 'true');
    if (btn.getAttribute('aria-label') !== reason) btn.setAttribute('aria-label', reason);
  } else if (btn.hasAttribute('aria-disabled')) {
    btn.removeAttribute('aria-disabled');
    btn.removeAttribute('aria-label');
    hideTip();
  }
}

// --- Page-level tooltip ----------------------------------------------------
// A disabled native button shows its reason via GitHub's .tooltipped CSS, but
// that pseudo-element is clipped by the checks card / sidebar overflow and at
// the viewport edge. We render our own instead: a fixed-position element on
// <body>, clamped at least TIP_MARGIN from every screen edge.

const TIP_CLASS = 'ghe-tip';
const TIP_GAP = 8; // distance from the button
const TIP_MARGIN = 16; // min distance from any screen edge
let tipEl: HTMLElement | null = null;

/** Show the tooltip for a proxy button, if it's aria-disabled with a reason. */
function showTipFor(btn: HTMLElement): void {
  if (btn.getAttribute('aria-disabled') !== 'true') return;
  const reason = btn.getAttribute('aria-label');
  if (reason) showTip(btn, reason);
}

function showTip(target: HTMLElement, text: string): void {
  hideTip();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;

  const tip = document.createElement('div');
  tip.className = TIP_CLASS;
  tip.textContent = text;
  tip.style.maxWidth = `${Math.min(280, vw - 2 * TIP_MARGIN)}px`;
  document.body.appendChild(tip);
  tipEl = tip;

  const r = target.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;

  // Prefer above the button, centered; drop below if it wouldn't clear the top.
  let top = r.top - th - TIP_GAP;
  if (top < TIP_MARGIN) top = r.bottom + TIP_GAP;
  top = Math.min(Math.max(top, TIP_MARGIN), vh - th - TIP_MARGIN);

  let left = r.left + r.width / 2 - tw / 2;
  left = Math.min(Math.max(left, TIP_MARGIN), vw - tw - TIP_MARGIN);

  tip.style.top = `${Math.round(top)}px`;
  tip.style.left = `${Math.round(left)}px`;
  requestAnimationFrame(() => tip.classList.add('is-visible'));

  // A fixed tooltip would drift from the button on scroll, so dismiss it.
  window.addEventListener('scroll', hideTip, true);
}

function hideTip(): void {
  if (!tipEl) return;
  tipEl.remove();
  tipEl = null;
  window.removeEventListener('scroll', hideTip, true);
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
    hideTip();
    return;
  }

  const slot = ensureSlot(box);

  if (showDraft && draftOriginal) {
    hideOnly(draftWrapper(draftOriginal), DRAFT_HIDDEN);
    ensureDraftBtn(slot);
    if (draftPending) {
      const db = slot.querySelector<HTMLElement>(':scope > .' + DRAFT_BTN_CLASS);
      if (db) setLoading(db); // re-assert if GitHub recreated the button
    }
  } else {
    draftPending = false; // the control is gone → the conversion landed
    clearAllHidden(DRAFT_HIDDEN);
    slot.querySelector(':scope > .' + DRAFT_BTN_CLASS)?.remove();
  }

  if (showClose && closeOriginal) {
    // Hide just the button's own .color-bg-subtle box, leaving the adjacent
    // Comment button in place.
    hideOnly(closeOriginal.closest<HTMLElement>('.color-bg-subtle') ?? closeOriginal, CLOSE_HIDDEN);
    ensureCloseBtn(slot, closeOriginal);
  } else {
    clearAllHidden(CLOSE_HIDDEN);
    slot.querySelector(':scope > .' + CLOSE_BTN_CLASS)?.remove();
    hideTip();
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
