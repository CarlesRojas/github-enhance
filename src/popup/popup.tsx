import { ReactNode, StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './popup.css';
import {
  DATE_FORMATS,
  DEFAULT_SETTINGS,
  PAGE_WIDTH_DEFAULT,
  PAGE_WIDTH_MAX,
  REPO_TABS,
  RepoTabDef,
  SIDEBAR_PCT_MAX,
  SIDEBAR_PCT_MIN,
  SIDEBAR_SECTIONS,
  Settings,
  TIME_FORMATS,
  loadRepoTabs,
  loadSettings,
  resolveDatePattern,
  saveSettings,
} from '../shared/settings';
import { formatDate } from '../shared/formatDate';
import { Group, Row, Select, Slider, Tabs, Toggle } from './components';

const VERSION = chrome.runtime.getManifest().version;

function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  function update(mutator: (draft: Settings) => void) {
    setSettings((prev) => {
      const next = structuredClone(prev ?? DEFAULT_SETTINGS);
      mutator(next);
      void saveSettings(next);
      return next;
    });
  }

  return { settings, update };
}

/**
 * The repository tab bar as the content script last saw it, so the switches
 * cover whatever GitHub renders today (Agents, "Security & quality", anything
 * added next). REPO_TABS stands in until a GitHub page has been visited.
 */
function useRepoTabs(): RepoTabDef[] {
  const [tabs, setTabs] = useState<RepoTabDef[]>(REPO_TABS);

  useEffect(() => {
    loadRepoTabs().then((stored) => {
      if (stored.length) setTabs(stored);
    });
  }, []);

  return tabs;
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 128 128" aria-hidden="true">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a371f7" />
          <stop offset="1" stopColor="#2f81f7" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="28" fill="#161b22" />
      <path
        d="M64 24 L78 50 L104 64 L78 78 L64 104 L50 78 L24 64 L50 50 Z"
        fill="url(#g)"
      />
    </svg>
  );
}

interface GroupProps {
  settings: Settings;
  update: (mutator: (draft: Settings) => void) => void;
}

// ---------------------------------------------------------------------------
// The popup is split by the page a setting acts on: General (all of GitHub),
// Repository (the tab bar on every repo page) and Pull requests, which is
// grouped again by area of the PR page.
// ---------------------------------------------------------------------------

/** Settings row for a plain boolean switch. */
function ToggleRow(props: {
  label: ReactNode;
  name: string;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  indented?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row
      label={props.label}
      description={props.description}
      indented={props.indented}
      disabled={props.disabled}
      control={
        <Toggle
          checked={props.checked}
          disabled={props.disabled}
          label={props.name}
          onChange={props.onChange}
        />
      }
    />
  );
}

function Experimental({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <span className="tag">Experimental</span>
    </>
  );
}

// --- General ---------------------------------------------------------------

function DatesGroup({ settings, update }: GroupProps) {
  const d = settings.dates;
  const now = new Date();

  return (
    <Group
      title="Dates"
      description="Replace relative dates like “yesterday” with an absolute date & time."
    >
      <ToggleRow
        label="Show absolute dates"
        name="Show absolute dates"
        checked={d.enabled}
        onChange={(v) => update((s) => (s.dates.enabled = v))}
      />

      <Row
        label="Date format"
        indented
        disabled={!d.enabled}
        control={
          <Select
            value={d.dateFormat}
            options={DATE_FORMATS.map((f) => ({ value: f.key, label: f.label }))}
            ariaLabel="Date format"
            disabled={!d.enabled}
            onChange={(v) => update((s) => (s.dates.dateFormat = v))}
          />
        }
      />

      <Row
        label="Time format"
        indented
        disabled={!d.enabled}
        control={
          <Select
            value={d.timeFormat}
            options={TIME_FORMATS.map((f) => ({ value: f.key, label: f.label }))}
            ariaLabel="Time format"
            disabled={!d.enabled}
            onChange={(v) => update((s) => (s.dates.timeFormat = v))}
          />
        }
      />

      <ToggleRow
        label="Hide year when current"
        name="Hide year when current"
        description="Omit the year for dates in the current year."
        indented
        disabled={!d.enabled}
        checked={d.hideCurrentYear}
        onChange={(v) => update((s) => (s.dates.hideCurrentYear = v))}
      />

      {d.enabled && (
        <div className="preview">
          <span className="from">yesterday</span>
          <span className="arrow">→</span>
          <span className="to">{formatDate(now, resolveDatePattern(settings, now, now))}</span>
        </div>
      )}
    </Group>
  );
}

function PageGroup({ settings, update }: GroupProps) {
  const l = settings.layout;
  return (
    <Group title="Page">
      <Row
        label="Page width"
        description="Max width of the page content."
        control={
          <Slider
            value={l.pageMaxWidth}
            min={PAGE_WIDTH_DEFAULT}
            max={PAGE_WIDTH_MAX}
            step={40}
            suffix="px"
            ariaLabel="Page width"
            onCommit={(v) => update((s) => (s.layout.pageMaxWidth = v))}
          />
        }
      />
      <ToggleRow
        label="Hide footer"
        name="Hide footer"
        description="Hide GitHub's page footer."
        checked={l.hideFooter}
        onChange={(v) => update((s) => (s.layout.hideFooter = v))}
      />
      <ToggleRow
        label="Pause while resizing"
        name="Pause while resizing"
        description="Skip page updates while the window is being resized, then catch up once it settles. Keeps resizing smooth."
        checked={l.pauseWhileResizing}
        onChange={(v) => update((s) => (s.layout.pauseWhileResizing = v))}
      />
    </Group>
  );
}

// --- Repository ------------------------------------------------------------

function RepoTabsGroup({ settings, update }: GroupProps) {
  const tabs = useRepoTabs();

  return (
    <Group
      title="Tabs"
      description="Turn a tab off to hide it from the bar at the top of every repository. “My PRs” is added by this extension, next to “Pull requests”, and opens the same page filtered to your own open PRs."
    >
      {tabs.map((tab) => {
        const visible = settings.nav.tabs[tab.key] ?? true;
        return (
          <ToggleRow
            key={tab.key}
            label={tab.label}
            name={`Show ${tab.label}`}
            description={visible ? 'Shown' : 'Hidden'}
            checked={visible}
            onChange={(v) => update((s) => (s.nav.tabs[tab.key] = v))}
          />
        );
      })}
    </Group>
  );
}

function RepoLookGroup({ settings, update }: GroupProps) {
  return (
    <Group title="Tab bar">
      <ToggleRow
        label="Blue selected tab"
        name="Blue selected tab"
        description="Color the selected tab's text and icon accent blue instead of underlining it in orange."
        checked={settings.nav.accentSelectedTab}
        onChange={(v) => update((s) => (s.nav.accentSelectedTab = v))}
      />
    </Group>
  );
}

// --- Pull requests ---------------------------------------------------------

function RedesignGroup({ settings, update }: GroupProps) {
  return (
    <Group
      title="Appearance"
      description="Visual overhaul of the pull request page. Works with all GitHub themes."
    >
      <ToggleRow
        label="Enable Pull Request Page Redesign"
        name="Enable Pull Request Page Redesign"
        checked={settings.appearance.redesign}
        onChange={(v) => update((s) => (s.appearance.redesign = v))}
      />
    </Group>
  );
}

function ChecksGroup({ settings, update }: GroupProps) {
  const l = settings.layout;
  return (
    <Group
      title="Checks"
      description="Where the checks / merge box goes. Applied on load — reload a PR after changing."
    >
      <ToggleRow
        label={<Experimental>Move checks up</Experimental>}
        name="Move checks up"
        description="Above the timeline on mobile; into the sidebar on wide screens."
        checked={l.checksTop}
        onChange={(v) => update((s) => (s.layout.checksTop = v))}
      />
      <ToggleRow
        label={<Experimental>Close button in checks</Experimental>}
        name="Close button in checks"
        description="Move the Close/Reopen PR button into the checks box, beside Convert to draft. Needs the redesign on."
        checked={l.closeInChecks}
        onChange={(v) => update((s) => (s.layout.closeInChecks = v))}
      />
    </Group>
  );
}

function SidebarGroup({ settings, update }: GroupProps) {
  const l = settings.layout;
  return (
    <Group title="Sidebar">
      <Row
        label="Sidebar width"
        description="Width of the PR sidebar on wide screens, as % of the content."
        control={
          <Slider
            value={l.sidebarWidthPct}
            min={SIDEBAR_PCT_MIN}
            max={SIDEBAR_PCT_MAX}
            suffix="%"
            ariaLabel="Sidebar width"
            onCommit={(v) => update((s) => (s.layout.sidebarWidthPct = v))}
          />
        }
      />
      <ToggleRow
        label="Collapsible sidebar"
        name="Collapsible sidebar"
        description="A button at the bottom right that hides the sidebar, leaving the description, comments and timeline at full width. Press it again to bring the sidebar back."
        checked={l.sidebarToggle}
        onChange={(v) => update((s) => (s.layout.sidebarToggle = v))}
      />
      <ToggleRow
        label={<Experimental>Sticky sidebar</Experimental>}
        name="Sticky sidebar"
        description="Keep the PR sidebar in view while the page scrolls."
        checked={l.stickySidebar}
        onChange={(v) => update((s) => (s.layout.stickySidebar = v))}
      />
    </Group>
  );
}

function SidebarSectionsGroup({ settings, update }: GroupProps) {
  return (
    <Group
      collapsible
      title="Sidebar sections"
      description="Turn a section off to hide it on PR & issue pages."
    >
      {SIDEBAR_SECTIONS.map((section) => {
        const visible = settings.sidebar.sections[section.key] ?? true;
        return (
          <ToggleRow
            key={section.key}
            label={section.label}
            name={`Show ${section.label}`}
            description={visible ? 'Shown' : 'Hidden'}
            checked={visible}
            onChange={(v) => update((s) => (s.sidebar.sections[section.key] = v))}
          />
        );
      })}
    </Group>
  );
}

function ConversationGroup({ settings, update }: GroupProps) {
  const l = settings.layout;
  return (
    <Group title="Conversation">
      <ToggleRow
        label="Hide-as-outdated button"
        name="Hide-as-outdated button"
        description="A “Hide” button on each comment that minimizes it as outdated in one click."
        checked={settings.hideComments.enabled}
        onChange={(v) => update((s) => (s.hideComments.enabled = v))}
      />
      <ToggleRow
        label={<Experimental>Move comment box to top</Experimental>}
        name="Move comment box to top"
        description="Show the “Add a comment” box above the timeline. Applied on load."
        checked={l.composeTop}
        onChange={(v) => update((s) => (s.layout.composeTop = v))}
      />
      <ToggleRow
        label="Hide guidelines & ProTip"
        name="Hide guidelines & ProTip"
        description="Hide the Community Guidelines reminder and the ProTip line."
        checked={l.hideNotices}
        onChange={(v) => update((s) => (s.layout.hideNotices = v))}
      />
      <ToggleRow
        label="Back to top button"
        name="Back to top button"
        description="A button at the bottom right to jump back to the top once you've scrolled down."
        checked={l.scrollTopButton}
        onChange={(v) => update((s) => (s.layout.scrollTopButton = v))}
      />
    </Group>
  );
}

function FilesGroup({ settings, update }: GroupProps) {
  return (
    <Group title="Files changed">
      <ToggleRow
        label="Hide viewed files"
        name="Hide viewed files"
        description="Open the Files changed tab with files you've marked as viewed already filtered out. Tick Viewed files in GitHub's file filter to show them again."
        checked={settings.layout.hideViewedFiles}
        onChange={(v) => update((s) => (s.layout.hideViewedFiles = v))}
      />
    </Group>
  );
}

// --- Shell -----------------------------------------------------------------

const PAGES = [
  { key: 'pr', label: 'Pull requests' },
  { key: 'repo', label: 'Repository' },
  { key: 'general', label: 'General' },
] as const;
type PageKey = (typeof PAGES)[number]['key'];

const PAGE_STORAGE_KEY = 'ghe-popup-page';

/** The selected page, remembered between popup openings on this machine. */
function usePage(): [PageKey, (p: PageKey) => void] {
  const [page, setPage] = useState<PageKey>(() => {
    try {
      const saved = localStorage.getItem(PAGE_STORAGE_KEY);
      if (PAGES.some((p) => p.key === saved)) return saved as PageKey;
    } catch {
      // Storage unavailable: start on the first page.
    }
    return PAGES[0].key;
  });

  function select(p: PageKey) {
    setPage(p);
    try {
      localStorage.setItem(PAGE_STORAGE_KEY, p);
    } catch {
      // Not remembered; harmless.
    }
  }

  return [page, select];
}

function App() {
  const { settings, update } = useSettings();
  const [page, setPage] = usePage();
  const props = settings && { settings, update };

  return (
    <div className="app">
      <div className="app-top">
        <header className="app-header">
          <Logo />
          <h1>GitHub Enhance</h1>
          <span className="version">v{VERSION}</span>
        </header>
        <Tabs tabs={PAGES} selected={page} onSelect={setPage} />
      </div>

      {props && (
        <div role="tabpanel" id={`panel-${page}`} aria-labelledby={`tab-${page}`}>
          {page === 'pr' && (
            <>
              <RedesignGroup {...props} />
              <ChecksGroup {...props} />
              <SidebarGroup {...props} />
              <SidebarSectionsGroup {...props} />
              <ConversationGroup {...props} />
              <FilesGroup {...props} />
            </>
          )}
          {page === 'repo' && (
            <>
              <RepoLookGroup {...props} />
              <RepoTabsGroup {...props} />
            </>
          )}
          {page === 'general' && (
            <>
              <DatesGroup {...props} />
              <PageGroup {...props} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
