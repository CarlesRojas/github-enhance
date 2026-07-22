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
  | 'participants';

export interface SidebarSectionDef {
  key: SidebarSectionKey;
  label: string;
  /** Lower-cased substrings matched against a sidebar section's heading text. */
  match: string[];
}

export const SIDEBAR_SECTIONS: SidebarSectionDef[] = [
  { key: 'reviewers', label: 'Reviewers', match: ['reviewers', 'reviewer'] },
  { key: 'assignees', label: 'Assignees', match: ['assignees', 'assignee'] },
  { key: 'labels', label: 'Labels', match: ['labels', 'label'] },
  { key: 'projects', label: 'Projects', match: ['projects', 'project'] },
  { key: 'milestone', label: 'Milestone', match: ['milestone'] },
  { key: 'development', label: 'Development', match: ['development'] },
  { key: 'notifications', label: 'Notifications', match: ['notifications'] },
  { key: 'participants', label: 'Participants', match: ['participants', 'participant'] },
];

export interface DateFormatPreset {
  key: string;
  label: string;
  pattern: string;
}

export const DATE_PRESETS: DateFormatPreset[] = [
  { key: 'iso', label: 'ISO — 2026-07-22 14:30', pattern: 'YYYY-MM-DD HH:mm' },
  { key: 'us', label: 'US — Jul 22, 2026, 2:30 PM', pattern: 'MMM D, YYYY, h:mm A' },
  { key: 'eu', label: 'EU — 22 Jul 2026 14:30', pattern: 'D MMM YYYY HH:mm' },
  { key: 'long', label: 'Long — Wed, July 22, 2026 14:30', pattern: 'ddd, MMMM D, YYYY HH:mm' },
  { key: 'dateonly', label: 'Date only — 2026-07-22', pattern: 'YYYY-MM-DD' },
  { key: 'custom', label: 'Custom…', pattern: '' },
];

export interface Settings {
  dates: {
    enabled: boolean;
    /** One of DATE_PRESETS keys. When 'custom', `pattern` is used verbatim. */
    preset: string;
    /** Token pattern (see formatDate). Kept in sync with the chosen preset. */
    pattern: string;
  };
  sidebar: {
    enabled: boolean;
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
  dates: { enabled: true, preset: 'iso', pattern: 'YYYY-MM-DD HH:mm' },
  sidebar: {
    enabled: false,
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
      enabled: p.sidebar?.enabled ?? DEFAULT_SETTINGS.sidebar.enabled,
      sections: { ...DEFAULT_SETTINGS.sidebar.sections, ...(p.sidebar?.sections ?? {}) },
    },
    hideComments: { ...DEFAULT_SETTINGS.hideComments, ...(p.hideComments ?? {}) },
    timeline: { ...DEFAULT_SETTINGS.timeline, ...(p.timeline ?? {}) },
  };
}

/** The date pattern that should actually be rendered, resolving presets. */
export function effectiveDatePattern(s: Settings): string {
  if (s.dates.preset === 'custom') return s.dates.pattern || 'YYYY-MM-DD HH:mm';
  const preset = DATE_PRESETS.find((p) => p.key === s.dates.preset);
  return preset?.pattern || s.dates.pattern || 'YYYY-MM-DD HH:mm';
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
