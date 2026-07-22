// Feature 1: replace relative dates ("Yesterday", "last week") with an
// absolute date/time formatted per the user's settings.
//
// Strategy: GitHub renders relative times inside custom elements
// (<relative-time>, <time-ago>, <local-time>) that carry a `datetime`
// attribute and keep re-rendering themselves on a timer. Rather than fight
// that, we hide the original element and insert a sibling <span> with our
// formatted text. This is fully reversible: remove the span, unhide the
// original.

import { Settings, resolveDatePattern } from '../../shared/settings';
import { formatDate } from '../../shared/formatDate';

const SELECTOR = 'relative-time, time-ago, local-time';
const SPAN_CLASS = 'ghe-date';
const HIDDEN_ATTR = 'data-ghe-date-hidden';

function siblingSpan(el: Element): HTMLElement | null {
  const next = el.nextElementSibling;
  if (next && next.classList.contains(SPAN_CLASS)) return next as HTMLElement;
  return null;
}

function restore(el: HTMLElement): void {
  siblingSpan(el)?.remove();
  if (el.hasAttribute(HIDDEN_ATTR)) {
    el.style.display = el.getAttribute(HIDDEN_ATTR) || '';
    el.removeAttribute(HIDDEN_ATTR);
  }
}

export function applyDates(settings: Settings): void {
  const elements = document.querySelectorAll<HTMLElement>(SELECTOR);

  if (!settings.dates.enabled) {
    elements.forEach(restore);
    return;
  }

  const now = new Date();

  elements.forEach((el) => {
    const raw = el.getAttribute('datetime') || el.getAttribute('title');
    if (!raw) return;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return;

    const text = formatDate(date, resolveDatePattern(settings, date, now));
    const title = el.getAttribute('title') || date.toString();

    let span = siblingSpan(el);
    if (!span) {
      span = document.createElement('span');
      span.className = SPAN_CLASS;
      el.insertAdjacentElement('afterend', span);
    }
    if (span.textContent !== text) span.textContent = text;
    if (span.title !== title) span.title = title;

    if (!el.hasAttribute(HIDDEN_ATTR)) {
      // Remember the inline display value so we can restore it exactly.
      el.setAttribute(HIDDEN_ATTR, el.style.display || '');
      el.style.display = 'none';
    }
  });
}
