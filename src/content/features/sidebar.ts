// Feature 2: show/hide individual sections in the right-hand sidebar of a
// pull-request / issue page (Reviewers, Assignees, Labels, Projects,
// Milestone, Development, Notifications, Participants).
//
// Sections are matched by their heading text so this keeps working even when
// GitHub reorders them. Hiding is reconciled on every pass, so toggling a
// section back on in the popup restores it without a reload.

import { Settings, SIDEBAR_SECTIONS } from '../../shared/settings';
import { normText } from '../util';

const MARK = 'data-ghe-section';

function findSidebar(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('#partial-discussion-sidebar') ||
    document.querySelector<HTMLElement>('.Layout-sidebar')
  );
}

export function applySidebar(settings: Settings): void {
  const sidebar = findSidebar();
  if (!sidebar) return;

  const items = sidebar.querySelectorAll<HTMLElement>('.discussion-sidebar-item');
  items.forEach((item) => {
    const heading = item.querySelector('.discussion-sidebar-heading, h3, h2');
    const text = normText(heading) || normText(item.firstElementChild);
    if (!text) return;

    const section = SIDEBAR_SECTIONS.find((s) =>
      s.match.some((m) => text.startsWith(m)),
    );
    if (!section) return;

    item.setAttribute(MARK, section.key);

    // When the feature is off, everything is visible (restore).
    const visible = !settings.sidebar.enabled
      ? true
      : settings.sidebar.sections[section.key] ?? true;

    const desired = visible ? '' : 'none';
    if (item.style.display !== desired) item.style.display = desired;
  });
}
