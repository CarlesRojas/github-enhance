// Feature 6: repository tab bar tweaks.
//
//   • myPullRequests   — rename the "Pull requests" tab and point it at the
//     same page, pre-filtered to your own open pull requests.
//   • accentSelectedTab — drop the selected tab's orange underline and color
//     its label + icon accent blue instead (pure CSS, see content.css).
//
// The tab keeps its icon, position and behaviour; only its href and label
// change. The filter uses GitHub's own search syntax with the `@me`
// self-reference, so no username lookup (and no extra permission) is needed.
//
// The tab bar is React-rendered and re-rendered on soft (Turbo) navigation, so
// every pass asserts the desired state instead of trusting a one-shot marker:
// the original href/label are stashed on the anchor and restored when the
// option is turned off — no reload needed. If React replaces the anchor
// outright it comes back in its original state and the next pass re-applies.

import { Settings } from '../../shared/settings';

/** Marks a patched tab; holds the JSON needed to restore it. */
const MARK = 'data-ghe-my-prs';
/** Drives the selected-tab accent styling in content.css. */
const ACCENT_ATTR = 'data-ghe-tab-accent';
const LABEL = 'My Pull Requests';
const FILTER = 'is:pr is:open author:@me';

interface Original {
  href: string;
  text: string;
  /** Primer's label-width placeholder; absent on markup that doesn't use it. */
  content: string | null;
}

/** Both the underline nav and the overflow menu it spills into at narrow widths. */
function prTabs(): HTMLAnchorElement[] {
  return Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[data-tab-item="pull-requests"]'),
  );
}

function labelSpan(tab: HTMLAnchorElement): HTMLElement | null {
  return tab.querySelector<HTMLElement>('[data-component="text"]');
}

function counter(tab: HTMLAnchorElement): HTMLElement | null {
  return tab.querySelector<HTMLElement>('[data-component="counter"]');
}

/** The same /pulls URL, with our filter as its search query. */
function filtered(href: string): string {
  const url = new URL(href, location.origin);
  url.search = new URLSearchParams({ q: FILTER }).toString();
  return url.pathname + url.search;
}

function readOriginal(tab: HTMLAnchorElement): Original | null {
  const raw = tab.getAttribute(MARK);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Original;
    return typeof parsed?.href === 'string' && parsed.href ? parsed : null;
  } catch {
    return null;
  }
}

function patch(tab: HTMLAnchorElement): void {
  const span = labelSpan(tab);

  let original = readOriginal(tab);
  if (!original) {
    original = {
      href: tab.getAttribute('href') ?? '',
      text: span?.textContent ?? '',
      content: span?.getAttribute('data-content') ?? null,
    };
    if (!original.href) return; // not the markup we expect — leave it alone
    tab.setAttribute(MARK, JSON.stringify(original));
  }

  // Always derive from the stashed original, so a href React reset behind our
  // back is re-patched instead of being filtered twice.
  const href = filtered(original.href);
  if (tab.getAttribute('href') !== href) tab.setAttribute('href', href);

  if (span) {
    if (span.textContent !== LABEL) span.textContent = LABEL;
    // Primer reserves room for the bold (selected) label via a `data-content`
    // pseudo-element; keep it in sync or the tab is sized for the old name.
    if (original.content !== null && span.getAttribute('data-content') !== LABEL) {
      span.setAttribute('data-content', LABEL);
    }
  }

  // The counter is GitHub's count of *all* open PRs, so it no longer describes
  // what the tab opens — hide it rather than show a number that won't match.
  const count = counter(tab);
  if (count && count.style.display !== 'none') {
    count.style.setProperty('display', 'none', 'important');
  }
}

function restore(tab: HTMLAnchorElement): void {
  const original = readOriginal(tab);
  if (!tab.hasAttribute(MARK)) return;
  tab.removeAttribute(MARK);
  counter(tab)?.style.removeProperty('display');
  if (!original) return;

  tab.setAttribute('href', original.href);
  const span = labelSpan(tab);
  if (!span) return;
  span.textContent = original.text;
  if (original.content !== null) span.setAttribute('data-content', original.content);
}

export function applyNav(settings: Settings): void {
  // Styling only — the attribute is all content.css needs, so there is nothing
  // to reconcile per tab and it survives GitHub's re-renders for free.
  document.documentElement.toggleAttribute(ACCENT_ATTR, settings.nav.accentSelectedTab);

  const on = settings.nav.myPullRequests;
  prTabs().forEach((tab) => (on ? patch(tab) : restore(tab)));
}
