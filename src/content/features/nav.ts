// Feature 6: repository tab bar tweaks.
//
//   • tabs: one visibility switch per tab in the bar (Code, Issues, Actions
//     and the rest). Ours, "My PRs", is one of them: turning it off doesn't
//     hide the tab, it stops it being added at all.
//   • My PRs: a tab next to the repository's "Pull requests" one, pointing at
//     the same page pre-filtered to your own open pull requests.
//   • accentSelectedTab: drop the selected tab's orange underline and color
//     its label + icon accent blue instead (pure CSS, see content.css).
//
// The new tab is a clone of the "Pull requests" one, so it inherits GitHub's
// markup, icon, styling and Turbo behaviour for free; only its href, label and
// count differ. GitHub's own tab is left untouched. The filter uses GitHub's
// search syntax with the `@me` self-reference, so no username lookup (and no
// extra permission) is needed.
//
// While the current page *is* the filtered list, the selected state moves from
// GitHub's tab to ours: GitHub highlights "Pull requests" on any /pulls URL,
// including ours, and the highlight belongs on the tab that opened it. What we
// take off GitHub's tab is stashed on it and handed back the moment the filter
// no longer matches (or the option is turned off).
//
// The tab bar is React-rendered and re-rendered on soft (Turbo) navigation, so
// every pass asserts the desired state instead of trusting a one-shot marker:
// a missing clone is re-inserted, an existing one is re-synced (the repository
// and the current URL both change under us), and orphans left behind by a
// re-render are dropped.

import {
  MY_PRS_TAB,
  REPO_TABS,
  RepoTabDef,
  Settings,
  loadRepoTabs,
  mergeRepoTabs,
  saveRepoTabs,
} from '../../shared/settings';

/** Marks the element we inserted (the <li>, or the anchor if there is none). */
const MARK = 'data-ghe-my-prs';
/** The cloned anchor's tab id, distinct so GitHub's own tab logic skips it. */
const CLONE_TAB = 'ghe-my-prs';
/** Holds GitHub's own selected state while our tab wears it. */
const STASH = 'data-ghe-selected';
/** Marks a tab we hid, so we only ever un-hide our own doing. */
const HIDDEN = 'data-ghe-tab-hidden';
/** Drives the selected-tab accent styling in content.css. */
const ACCENT_ATTR = 'data-ghe-tab-accent';
const LABEL = 'My PRs';
const FILTER = 'is:pr is:open author:@me';
/** The tabs we can name without having seen the page; discovery adds the rest. */
const KNOWN_KEYS = new Set(REPO_TABS.map((t) => t.key));

/** GitHub's own tabs, in both the underline nav and the narrow-width menu. */
function prTabs(): HTMLAnchorElement[] {
  return Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[data-tab-item="pull-requests"]'),
  );
}

/** Every tab in the bar, GitHub's and ours, in both the nav and the menu. */
function allTabs(): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[data-tab-item]'));
}

/**
 * A tab's settings key. GitHub has used both `data-tab-item="code"` and
 * `data-tab-item="i0code-tab"`, so the value is normalized down to the bare
 * name. Null for an anchor carrying no tab id at all.
 */
function tabKey(tab: HTMLAnchorElement): string | null {
  const raw = tab.getAttribute('data-tab-item') ?? '';
  if (raw === CLONE_TAB) return MY_PRS_TAB;
  return raw.replace(/^i\d+/, '').replace(/-tab$/, '').toLowerCase() || null;
}

/** What GitHub calls the tab, for the switch in the popup. */
function tabLabel(tab: HTMLAnchorElement, key: string): string {
  const text = labelSpan(tab)?.textContent?.trim();
  if (text) return text;
  const aria = tab.getAttribute('aria-label')?.trim();
  if (aria) return aria;
  return key.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/**
 * The repository tab bar itself. Found through a tab we know rather than by
 * selector, so it doesn't matter what GitHub wraps the bar in this month.
 */
function tabBar(): HTMLElement | null {
  for (const tab of allTabs()) {
    const key = tabKey(tab);
    if (!key || (!KNOWN_KEYS.has(key) && key !== MY_PRS_TAB)) continue;
    const nav = tab.closest('nav');
    if (nav) return nav;
  }
  return null;
}

/**
 * The tabs GitHub is rendering right now, ours included. Only the bar itself
 * is read: `data-tab-item` is used elsewhere on GitHub (the tabs on a pull
 * request, for one) and those aren't repository tabs.
 */
function presentTabs(): RepoTabDef[] {
  const bar = tabBar();
  if (!bar) return [];

  const tabs: RepoTabDef[] = [];
  const seen = new Set<string>();
  for (const tab of bar.querySelectorAll<HTMLAnchorElement>('a[data-tab-item]')) {
    const key = tabKey(tab);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    tabs.push({ key, label: tabLabel(tab, key) });
  }
  return tabs;
}

/** The last list we wrote, so an unchanged bar costs nothing per pass. */
let published = '';

/**
 * Publish the bar for the popup to build its switches from. GitHub adds and
 * renames tabs on its own schedule, so the switches follow the page rather
 * than a list baked in here.
 */
function publishTabs(): void {
  const tabs = presentTabs();
  if (!tabs.length) return;

  const json = JSON.stringify(tabs);
  if (json === published) return;
  published = json;

  void loadRepoTabs().then((stored) => {
    const merged = mergeRepoTabs(stored, tabs);
    if (JSON.stringify(merged) !== JSON.stringify(stored)) void saveRepoTabs(merged);
  });
}

/** Every tab we inserted, wherever it currently sits. */
function ourTabs(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${MARK}]`));
}

/** The list item the tab lives in, or the anchor itself on flatter markup. */
function host(tab: HTMLAnchorElement): HTMLElement {
  return tab.closest('li') ?? tab;
}

function anchorIn(node: HTMLElement): HTMLAnchorElement | null {
  if (node instanceof HTMLAnchorElement) return node;
  return node.querySelector<HTMLAnchorElement>('a');
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

/**
 * True while the page being viewed is a list of your own pull requests in this
 * repository. Two URL shapes qualify, both under GitHub's /pulls path:
 *
 *   /owner/repo/pulls?q=is:pr+is:open+author:@me   what our tab links to
 *   /owner/repo/pulls/@me                          GitHub's own shortcut
 *
 * The query is matched on `author:@me` alone rather than as a whole, so
 * narrowing the filter on the page (adding a label, dropping `is:open`) keeps
 * the tab highlighted. `review-requested:@me` and friends don't count: those
 * are somebody else's pull requests.
 */
function showsOurList(href: string): boolean {
  const base = new URL(href, location.origin).pathname; // /owner/repo/pulls
  const path = location.pathname;
  if (path !== base && !path.startsWith(`${base}/`)) return false;

  if (path.slice(base.length).replace(/\/+$/, '') === '/@me') return true;

  const raw = new URLSearchParams(location.search).get('q') ?? '';
  // GitHub round-trips the query through the search box, which can leave the
  // `@` percent-encoded even inside the decoded parameter.
  let q = raw;
  try {
    q = decodeURIComponent(raw);
  } catch {
    /* malformed escape: match against the raw value instead */
  }
  return q.toLowerCase().includes('author:@me');
}

/**
 * How a tab says it is the current one. Primer's underline nav and the classic
 * markup disagree, so all three carriers travel together.
 */
interface Marks {
  current: string | null;
  selected: string | null;
  klass: boolean;
}

function readMarks(el: HTMLElement): Marks {
  return {
    current: el.getAttribute('aria-current'),
    selected: el.getAttribute('aria-selected'),
    klass: el.classList.contains('selected'),
  };
}

function writeMarks(el: HTMLElement, marks: Marks): void {
  for (const [name, value] of [
    ['aria-current', marks.current],
    ['aria-selected', marks.selected],
  ] as const) {
    if (value === null) el.removeAttribute(name);
    else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }
  el.classList.toggle('selected', marks.klass);
}

const NO_MARKS: Marks = { current: null, selected: null, klass: false };
const DEFAULT_MARKS: Marks = { current: 'page', selected: null, klass: false };

/** Take GitHub's selected state off its tab, stashing it for later. */
function claimMarks(source: HTMLAnchorElement): Marks {
  const stashed = source.getAttribute(STASH);
  if (stashed !== null) {
    // Already ours; React may have re-marked the tab since, so clear it again.
    writeMarks(source, NO_MARKS);
    try {
      return JSON.parse(stashed) as Marks;
    } catch {
      return DEFAULT_MARKS;
    }
  }

  const marks = readMarks(source);
  source.setAttribute(STASH, JSON.stringify(marks));
  writeMarks(source, NO_MARKS);
  // GitHub marks its tab on every /pulls URL, ours included, but if this
  // markup carries the state some other way, still highlight our tab.
  return marks.current || marks.selected || marks.klass ? marks : DEFAULT_MARKS;
}

/** Hand GitHub's selected state back. */
function releaseMarks(source: HTMLAnchorElement): void {
  const stashed = source.getAttribute(STASH);
  if (stashed === null) return;
  source.removeAttribute(STASH);
  try {
    writeMarks(source, JSON.parse(stashed) as Marks);
  } catch {
    /* nothing sane to restore: leave the tab as GitHub last rendered it */
  }
}

/** Point the clone's anchor at our filtered URL and label it. */
function sync(clone: HTMLElement, source: HTMLAnchorElement): void {
  const anchor = anchorIn(clone);
  if (!anchor) return;

  // Derive from GitHub's current href every pass: the repository (and so the
  // /pulls path) changes under us on soft navigation.
  const sourceHref = source.getAttribute('href');
  if (sourceHref) {
    const href = filtered(sourceHref);
    if (anchor.getAttribute('href') !== href) anchor.setAttribute('href', href);
  }

  const span = labelSpan(anchor);
  if (span) {
    if (span.textContent !== LABEL) span.textContent = LABEL;
    // Primer reserves room for the bold (selected) label via a `data-content`
    // pseudo-element; keep it in sync or the tab is sized for the old name.
    if (span.hasAttribute('data-content') && span.getAttribute('data-content') !== LABEL) {
      span.setAttribute('data-content', LABEL);
    }
  }

  // GitHub's counter counts *all* open PRs, so it doesn't describe what our
  // tab opens, so the repo-wide count stays on GitHub's own tab.
  counter(anchor)?.remove();

  // Exactly one tab is highlighted: ours while its list is what's on screen,
  // GitHub's otherwise.
  let marks = NO_MARKS;
  if (showsOurList(anchor.href)) {
    marks = claimMarks(source);
  } else {
    releaseMarks(source);
  }
  writeMarks(anchor, marks);
  if (clone !== anchor) writeMarks(clone, marks);
}

function build(source: HTMLAnchorElement): HTMLElement {
  const clone = host(source).cloneNode(true) as HTMLElement;

  // Ids would be duplicated across the two tabs, and a cloned <tool-tip>
  // targets its `for` id (i.e. GitHub's tab) with our label.
  clone.querySelectorAll('tool-tip').forEach((tip) => tip.remove());
  if (clone.hasAttribute('id')) clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));

  const anchor = anchorIn(clone);
  anchor?.setAttribute('data-tab-item', CLONE_TAB);
  anchor?.removeAttribute('data-hotkey');
  clone.setAttribute(MARK, '');

  sync(clone, source);
  return clone;
}

function apply(): void {
  const kept = new Set<HTMLElement>();

  for (const tab of prTabs()) {
    const container = host(tab);
    const next = container.nextElementSibling;
    if (next instanceof HTMLElement && next.hasAttribute(MARK)) {
      sync(next, tab);
      kept.add(next);
    } else {
      const clone = build(tab);
      container.after(clone);
      kept.add(clone);
    }
  }

  // A re-render can replace GitHub's tab and leave ours stranded (or move it);
  // anything not sitting right after a live "Pull requests" tab is stale.
  for (const clone of ourTabs()) if (!kept.has(clone)) clone.remove();
}

function restore(): void {
  for (const clone of ourTabs()) clone.remove();
  for (const tab of prTabs()) releaseMarks(tab);
}

/**
 * Hide the tabs that are switched off and show the ones that aren't. Only tabs
 * we hid are ever shown again, so a tab GitHub itself keeps out of view (the
 * ones the narrow-width menu holds) stays that way.
 */
function applyVisibility(settings: Settings): void {
  for (const tab of allTabs()) {
    const key = tabKey(tab);
    const target = host(tab);
    // Only an explicit "off" hides a tab, and the popup only ever writes keys
    // it discovered in the bar, so a `data-tab-item` used elsewhere on the
    // page (the tabs on a pull request, for one) is never touched.
    const hide = key !== null && settings.nav.tabs[key] === false;

    if (hide) {
      target.setAttribute(HIDDEN, '');
      target.style.setProperty('display', 'none', 'important');
    } else if (target.hasAttribute(HIDDEN)) {
      target.removeAttribute(HIDDEN);
      target.style.removeProperty('display');
    }
  }
}

export function applyNav(settings: Settings): void {
  // Styling only: the attribute is all content.css needs, so there is nothing
  // to reconcile per tab and it survives GitHub's re-renders for free.
  document.documentElement.toggleAttribute(ACCENT_ATTR, settings.nav.accentSelectedTab);

  // Off means "never added" rather than "added, then hidden": an inert tab in
  // the DOM would still take its turn in the keyboard order.
  if (settings.nav.tabs[MY_PRS_TAB] === false) restore();
  else apply();

  applyVisibility(settings);
  publishTabs();
}
