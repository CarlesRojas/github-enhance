// Feature 2: show/hide individual sections in the right-hand sidebar of a
// pull-request / issue page (Reviewers, Assignees, Labels, Projects,
// Milestone, Development, Notifications, Participants, Lock conversation).
//
// Each section toggle is independent (no master switch) and defaults to shown,
// so nothing is hidden until you turn a section off.
//
// Sections are located three ways, most-specific first:
//   1. Known container selectors (e.g. #partial-users-participants).
//   2. A titled section whose heading text matches (Reviewers, Milestone…).
//   3. An action control whose button/link text matches ("Lock conversation").
// Hiding is reconciled every pass, so re-enabling a section restores it.

import { Settings, SidebarSectionDef, SIDEBAR_SECTIONS } from '../../shared/settings';
import { normText } from '../util';

function blockFor(el: HTMLElement, tight: boolean): HTMLElement {
  if (tight) {
    return (
      el.closest<HTMLElement>('p, li') ||
      el.closest<HTMLElement>('.discussion-sidebar-item') ||
      el
    );
  }
  return el.closest<HTMLElement>('.discussion-sidebar-item') || el;
}

/** An item's title heading (never its body, so label/user text can't match). */
function titleOf(item: HTMLElement): HTMLElement | null {
  return (
    item.querySelector<HTMLElement>('.discussion-sidebar-heading') ||
    item.querySelector<HTMLElement>('summary, h3, h2') ||
    item.querySelector<HTMLElement>('.text-bold')
  );
}

function locate(sec: SidebarSectionDef): HTMLElement[] {
  const found = new Set<HTMLElement>();

  for (const selector of sec.containers ?? []) {
    document
      .querySelectorAll<HTMLElement>(selector)
      .forEach((el) => found.add(blockFor(el, !!sec.tight)));
  }

  document.querySelectorAll<HTMLElement>('.discussion-sidebar-item').forEach((item) => {
    if (sec.tight) {
      // Action control (e.g. "Lock conversation") — scan interactive elements.
      for (const el of item.querySelectorAll<HTMLElement>('button, summary, a, .btn-link')) {
        if (sec.match.some((m) => normText(el).includes(m))) {
          found.add(blockFor(el, true));
          break;
        }
      }
    } else {
      // Titled section — match ONLY the item's title, so body content like
      // label names or usernames can never trigger a false hide.
      const text = normText(titleOf(item));
      if (text && sec.match.some((m) => text.includes(m))) found.add(item);
    }
  });

  return [...found];
}

const STICKY_MARK = 'ghe-sticky-target';
const STICKY_PROPS = ['position', 'top', 'max-height', 'overflow-y', 'align-self'];

/**
 * The element to make sticky: the Primer PageLayout pane wrapper (the actual
 * flex child next to the tall main column), falling back to the pane itself or
 * the classic .Layout-sidebar.
 */
function stickyTarget(): HTMLElement | null {
  const pane = document.querySelector<HTMLElement>(
    '#pr-conversation-sidebar, .Layout-sidebar',
  );
  if (!pane) return null;
  const wrap = pane.parentElement;
  return wrap && /PaneWrapper/i.test(wrap.className) ? wrap : pane;
}

/**
 * Sticky is applied as inline styles with !important — the Primer React layout
 * both out-specificities injected classes and re-renders over them, so a class
 * based approach silently does nothing. Inline importants always win, and the
 * mutation observer re-runs this pass if React replaces the node.
 */
function applySticky(on: boolean): void {
  const target = on ? stickyTarget() : null;

  document.querySelectorAll<HTMLElement>('.' + STICKY_MARK).forEach((el) => {
    if (el !== target) {
      STICKY_PROPS.forEach((p) => el.style.removeProperty(p));
      el.classList.remove(STICKY_MARK);
    }
  });
  if (!target) return;

  target.classList.add(STICKY_MARK);
  target.style.setProperty('position', 'sticky', 'important');
  target.style.setProperty('top', '16px', 'important');
  target.style.setProperty('max-height', 'calc(100vh - 32px)', 'important');
  target.style.setProperty('overflow-y', 'auto', 'important');
  // Keep the flex child from stretching to the row's full height, which would
  // leave sticky no room to travel.
  target.style.setProperty('align-self', 'flex-start', 'important');
}

function setVisible(el: HTMLElement, visible: boolean): void {
  if (visible) {
    // Only clear the inline override we set; leave any pre-existing value.
    if (el.style.getPropertyValue('display') === 'none') el.style.removeProperty('display');
  } else {
    // `!important` is required to beat Primer utilities like `.d-block`
    // (display: block !important), which several sidebar items carry.
    el.style.setProperty('display', 'none', 'important');
  }
}

export function applySidebar(settings: Settings): void {
  applySticky(settings.sidebar.sticky);

  if (!document.querySelector('.discussion-sidebar-item')) return;

  for (const sec of SIDEBAR_SECTIONS) {
    const visible = settings.sidebar.sections[sec.key] ?? true;
    for (const block of locate(sec)) setVisible(block, visible);
  }
}
