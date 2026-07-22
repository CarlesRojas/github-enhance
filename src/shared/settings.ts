// Settings schema shared by the popup UI and the content scripts.
// Persisted in chrome.storage.sync under a single key.

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
  {
    key: 'development',
    label: 'Development',
    match: ['development'],
    containers: ['#partial-pull-request-development', '[data-target="development-menu.summary"]'],
  },
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
  };
  sidebar: {
    /** section key -> visible (true) / hidden (false). */
    sections: Record<string, boolean>;
  };
  hideComments: {
    enabled: boolean;
  };
  timeline: {
    enabled: boolean;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  dates: { enabled: true, dateFormat: 'iso', timeFormat: '24' },
  sidebar: {
    sections: Object.fromEntries(SIDEBAR_SECTIONS.map((s) => [s.key, true])),
  },
  hideComments: { enabled: true },
  timeline: { enabled: false },
};

const STORAGE_KEY = 'settings';

/** Deep-merge stored (possibly partial / older) settings onto the defaults. */
export function mergeSettings(partial: unknown): Settings {
  const p = (partial ?? {}) as Partial<Settings>;
  return {
    dates: { ...DEFAULT_SETTINGS.dates, ...(p.dates ?? {}) },
    sidebar: {
      sections: { ...DEFAULT_SETTINGS.sidebar.sections, ...(p.sidebar?.sections ?? {}) },
    },
    hideComments: { ...DEFAULT_SETTINGS.hideComments, ...(p.hideComments ?? {}) },
    timeline: { ...DEFAULT_SETTINGS.timeline, ...(p.timeline ?? {}) },
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
