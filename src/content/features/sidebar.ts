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

function locate(sec: SidebarSectionDef): HTMLElement[] {
  const found = new Set<HTMLElement>();

  for (const selector of sec.containers ?? []) {
    document
      .querySelectorAll<HTMLElement>(selector)
      .forEach((el) => found.add(blockFor(el, !!sec.tight)));
  }

  // For action controls (tight) scan buttons/links; for titled sections scan
  // heading-like elements only, to avoid matching stray control text.
  const headingSelector = sec.tight
    ? 'button, summary, a, .btn-link'
    : '.discussion-sidebar-heading, summary, h3, h2, .text-bold';

  document.querySelectorAll<HTMLElement>('.discussion-sidebar-item').forEach((item) => {
    let matched: HTMLElement | null = null;
    for (const el of item.querySelectorAll<HTMLElement>(headingSelector)) {
      const text = normText(el);
      if (text && sec.match.some((m) => text.includes(m))) {
        matched = el;
        break;
      }
    }
    if (!matched && !sec.tight) {
      const text = normText(item);
      if (text && sec.match.some((m) => text.includes(m))) matched = item;
    }
    if (matched) found.add(blockFor(sec.tight ? matched : item, !!sec.tight));
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
  if (!document.querySelector('.discussion-sidebar-item')) return;

  for (const sec of SIDEBAR_SECTIONS) {
    const visible = settings.sidebar.sections[sec.key] ?? true;
    for (const block of locate(sec)) setVisible(block, visible);
  }
}
