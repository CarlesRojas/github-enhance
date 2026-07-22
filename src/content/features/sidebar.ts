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
  // Sticky sidebar — applied to the sidebar pane (the flex child). The Primer
  // PageLayout pane has a stable id; fall back to the classic layout column.
  const column = document.querySelector<HTMLElement>(
    '#pr-conversation-sidebar, .Layout-sidebar, #partial-discussion-sidebar',
  );
  if (column) column.classList.toggle('ghe-sidebar-sticky', settings.sidebar.sticky);

  if (!document.querySelector('.discussion-sidebar-item')) return;

  for (const sec of SIDEBAR_SECTIONS) {
    const visible = settings.sidebar.sections[sec.key] ?? true;
    for (const block of locate(sec)) setVisible(block, visible);
  }
}
