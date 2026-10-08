// Feature (part of the Layout group): a "back to top" button pinned to the
// bottom right of pull-request pages (Conversation, Commits, Checks and Files
// changed), shown once the page has been scrolled down.
//
// The button lives on <body>, outside every React root, so GitHub's
// re-renders never touch it. Most PR tabs scroll the window, but some views
// scroll an inner container instead, so scroll events are caught in the
// capture phase and the last element that scrolled far enough is the one the
// button scrolls back. The button is created once and only shown or hidden
// afterwards; off PR pages (or with the option off) it is removed.

import { Settings } from '../../shared/settings';
import { isPRPage } from '../util';

const ID = 'ghe-scroll-top';
/** How far down (px) before the button appears. */
const THRESHOLD = 250;
/**
 * Duration (ms) of the scroll back up. The browser's own `smooth` behaviour
 * scales with distance and crawls on long diffs; this is fixed.
 */
const DURATION = 250;

let enabled = false;
let listening = false;
/** The element that last scrolled past the threshold; null means the window. */
let scroller: HTMLElement | null = null;
let rafPending = false;

const ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">' +
  '<path d="M3.47 7.78a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018L9 4.81v7.44a.75.75 0 0 1-1.5 0V4.81L4.53 7.78a.75.75 0 0 1-1.06 0Z"></path>' +
  '</svg>';

function button(): HTMLButtonElement | null {
  return document.getElementById(ID) as HTMLButtonElement | null;
}

function ensureButton(): HTMLButtonElement {
  let btn = button();
  if (btn) return btn;
  btn = document.createElement('button');
  btn.id = ID;
  btn.type = 'button';
  btn.title = 'Back to top';
  btn.setAttribute('aria-label', 'Back to top');
  btn.innerHTML = ICON;
  btn.addEventListener('click', () => {
    const target = scroller?.isConnected ? scroller : null;
    if (target) scrollToTop(target);
    scrollToTop(window);
  });
  document.body.appendChild(btn);
  return btn;
}

/** Animate `el` to the top in DURATION ms (instant with reduced motion). */
function scrollToTop(el: HTMLElement | Window): void {
  const read = (): number => (el instanceof Window ? el.scrollY : el.scrollTop);
  const start = read();
  if (start <= 0) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.scrollTo(0, 0);
    return;
  }
  const t0 = performance.now();
  const step = (now: number): void => {
    const t = Math.min((now - t0) / DURATION, 1);
    const eased = 1 - (1 - t) ** 3; // ease-out cubic
    el.scrollTo(0, start * (1 - eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function scrolledDown(): boolean {
  if (window.scrollY > THRESHOLD) return true;
  return !!scroller?.isConnected && scroller.scrollTop > THRESHOLD;
}

function update(): void {
  rafPending = false;
  if (!enabled || !isPRPage()) {
    button()?.remove();
    return;
  }
  ensureButton().toggleAttribute('data-visible', scrolledDown());
}

function onScroll(e: Event): void {
  const t = e.target;
  // Only a container that fills most of the viewport counts as the page
  // scroller; a long code block or dropdown scrolling on its own doesn't.
  if (
    t instanceof HTMLElement &&
    t.scrollTop > THRESHOLD &&
    t.clientHeight > window.innerHeight / 2
  ) {
    scroller = t;
  }
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(update);
}

export function applyScrollTop(settings: Settings): void {
  enabled = settings.layout.scrollTopButton;
  if (enabled && !listening) {
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    listening = true;
  } else if (!enabled && listening) {
    document.removeEventListener('scroll', onScroll, { capture: true });
    listening = false;
    scroller = null;
  }
  update();
}
