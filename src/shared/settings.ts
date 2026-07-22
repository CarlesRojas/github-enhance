// Settings schema shared by the popup UI and the content scripts.
// Persisted in chrome.storage.sync under a single key.

import { stripYear } from './formatDate';

export type SidebarSectionKey =
  | 'reviewers'
  | 'assignees'
  | 'labels'
  | 'projects'
  | 'milestone'
  | 'development'
  | 'notifications'
  | 'participants'
  | 'lock';

export interface SidebarSectionDef {
  key: SidebarSectionKey;
  label: string;
  /** Lower-cased stems matched (via `includes`) against a section's heading. */
  match: string[];
  /** Optional selectors that identify the section's block directly. */
  containers?: string[];
  /**
   * When true this is an action control (e.g. "Lock conversation") rather than
   * a titled section: match against buttons/links and hide the tightest
   * wrapper so a neighbouring control isn't hidden too.
   */
  tight?: boolean;
}

export const SIDEBAR_SECTIONS: SidebarSectionDef[] = [
  { key: 'reviewers', label: 'Reviewers', match: ['reviewer'] },
  { key: 'assignees', label: 'Assignees', match: ['assignee'] },
  { key: 'labels', label: 'Labels', match: ['label'] },
  { key: 'projects', label: 'Projects', match: ['project'] },
  { key: 'milestone', label: 'Milestone', match: ['milestone'] },
  { key: 'development', label: 'Development', match: ['development'] },
  {
    key: 'notifications',
    label: 'Notifications',
    match: ['notification'],
    containers: ['#partial-subscription'],
  },
  {
    key: 'participants',
    label: 'Participants',
    match: ['participant'],
    containers: ['#partial-users-participants'],
  },
  {
    key: 'lock',
    label: 'Lock conversation',
    match: ['lock conversation'],
    containers: ['.lock-toggle-link', '.js-lock-conversation'],
    tight: true,
  },
];

/** Slider ranges. The sidebar's default pane is ~26% of the content area. */
export const SIDEBAR_PCT_MIN = 26;
export const SIDEBAR_PCT_MAX = 50;
export const PAGE_WIDTH_DEFAULT = 1280; // GitHub's own max page width
export const PAGE_WIDTH_MAX = 2560;

export interface DateTimeFormat {
  key: string;
  label: string;
  pattern: string;
}

export const DATE_FORMATS: DateTimeFormat[] = [
  { key: 'iso', label: '2026-07-22', pattern: 'YYYY-MM-DD' },
  { key: 'us-long', label: 'Jul 22, 2026', pattern: 'MMM D, YYYY' },
  { key: 'us-num', label: '07/22/2026', pattern: 'MM/DD/YYYY' },
  { key: 'eu-long', label: '22 Jul 2026', pattern: 'D MMM YYYY' },
  { key: 'eu-num', label: '22/07/2026', pattern: 'DD/MM/YYYY' },
  { key: 'weekday', label: 'Wed, Jul 22, 2026', pattern: 'ddd, MMM D, YYYY' },
  { key: 'long', label: 'Wednesday, July 22, 2026', pattern: 'dddd, MMMM D, YYYY' },
];

export const TIME_FORMATS: DateTimeFormat[] = [
  { key: 'none', label: 'No time', pattern: '' },
  { key: '24', label: '14:30', pattern: 'HH:mm' },
  { key: '24s', label: '14:30:05', pattern: 'HH:mm:ss' },
  { key: '12', label: '2:30 PM', pattern: 'h:mm A' },
  { key: '12s', label: '2:30:05 PM', pattern: 'h:mm:ss A' },
];

export interface Settings {
  dates: {
    enabled: boolean;
    dateFormat: string; // a DATE_FORMATS key
    timeFormat: string; // a TIME_FORMATS key ('none' for date only)
    hideCurrentYear: boolean; // drop the year when it's the current year
  };
  layout: {
    // Move the checks / merge box up: above the timeline on mobile, into the
    // sidebar on desktop (when the sidebar is shown as a column).
    checksTop: boolean;
    composeTop: boolean; // move the "Add a comment" box above the timeline
    hideNotices: boolean; // hide the Community Guidelines + ProTip notes
    /** Sidebar width (% of the content area) while checks live in it. */
    sidebarWidthPct: number;
    /** Max page width in px; PAGE_WIDTH_DEFAULT means GitHub's default. */
    pageMaxWidth: number;
  };
  sidebar: {
    /** section key -> visible (true) / hidden (false). */
    sections: Record<string, boolean>;
  };
  hideComments: {
    enabled: boolean;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  dates: { enabled: true, dateFormat: 'iso', timeFormat: '24', hideCurrentYear: false },
  layout: {
    checksTop: false,
    composeTop: false,
    hideNotices: true,
    sidebarWidthPct: 40,
    pageMaxWidth: 1280,
  },
  sidebar: {
    sections: Object.fromEntries(SIDEBAR_SECTIONS.map((s) => [s.key, true])),
  },
  hideComments: { enabled: true },
};

const STORAGE_KEY = 'settings';

/** Deep-merge stored (possibly partial / older) settings onto the defaults. */
export function mergeSettings(partial: unknown): Settings {
  const p = (partial ?? {}) as Partial<Settings>;
  return {
    dates: { ...DEFAULT_SETTINGS.dates, ...(p.dates ?? {}) },
    layout: { ...DEFAULT_SETTINGS.layout, ...(p.layout ?? {}) },
    sidebar: {
      sections: { ...DEFAULT_SETTINGS.sidebar.sections, ...(p.sidebar?.sections ?? {}) },
    },
    hideComments: { ...DEFAULT_SETTINGS.hideComments, ...(p.hideComments ?? {}) },
  };
}

/** The date pattern that should actually be rendered (date + time combined). */
export function effectiveDatePattern(s: Settings): string {
  const date =
    DATE_FORMATS.find((f) => f.key === s.dates.dateFormat)?.pattern ??
    DATE_FORMATS[0].pattern;
  const time =
    TIME_FORMATS.find((f) => f.key === s.dates.timeFormat)?.pattern ?? '';
  return time ? `${date} ${time}` : date;
}

/** The pattern for a specific date, honouring the "hide current year" option. */
export function resolveDatePattern(s: Settings, date: Date, now: Date): string {
  const pattern = effectiveDatePattern(s);
  if (s.dates.hideCurrentYear && date.getFullYear() === now.getFullYear()) {
    return stripYear(pattern);
  }
  return pattern;
}

export async function loadSettings(): Promise<Settings> {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  return mergeSettings(data[STORAGE_KEY]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
}

/** Subscribe to settings changes. Returns an unsubscribe function. */
export function onSettingsChanged(cb: (settings: Settings) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === 'sync' && changes[STORAGE_KEY]) {
      cb(mergeSettings(changes[STORAGE_KEY].newValue));
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
