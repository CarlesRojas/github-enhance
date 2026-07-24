import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './popup.css';
import {
  DATE_FORMATS,
  DEFAULT_SETTINGS,
  PAGE_WIDTH_DEFAULT,
  PAGE_WIDTH_MAX,
  SIDEBAR_PCT_MAX,
  SIDEBAR_PCT_MIN,
  SIDEBAR_SECTIONS,
  Settings,
  TIME_FORMATS,
  loadSettings,
  resolveDatePattern,
  saveSettings,
} from '../shared/settings';
import { formatDate } from '../shared/formatDate';
import { Group, Row, Select, Slider, Toggle } from './components';

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

function AppearanceGroup({ settings, update }: GroupProps) {
  return (
    <Group
      title="Appearance"
      description="Visual overhaul of the pull request page. Works with all GitHub themes."
    >
      <Row
        label="Enable Pull Request Page Redesign"
        control={
          <Toggle
            checked={settings.appearance.redesign}
            label="Enable Pull Request Page Redesign"
            onChange={(v) => update((s) => (s.appearance.redesign = v))}
          />
        }
      />
    </Group>
  );
}

function DatesGroup({ settings, update }: GroupProps) {
  const d = settings.dates;
  const now = new Date();

  return (
    <Group
      title="Dates"
      description="Replace relative dates like “yesterday” with an absolute date & time."
    >
      <Row
        label="Show absolute dates"
        control={
          <Toggle
            checked={d.enabled}
            label="Show absolute dates"
            onChange={(v) => update((s) => (s.dates.enabled = v))}
          />
        }
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

      <Row
        label="Hide year when current"
        description="Omit the year for dates in the current year."
        indented
        disabled={!d.enabled}
        control={
          <Toggle
            checked={d.hideCurrentYear}
            disabled={!d.enabled}
            label="Hide year when current"
            onChange={(v) => update((s) => (s.dates.hideCurrentYear = v))}
          />
        }
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

function LayoutGroup({ settings, update }: GroupProps) {
  const l = settings.layout;
  return (
    <Group
      title="Pull Request Layout"
      description="Rearrange the conversation. Applied on load — reload a PR after changing."
    >
      <Row
        label={
          <>
            Move checks up
            <span className="tag">Experimental</span>
          </>
        }
        description="Above the timeline on mobile; into the sidebar on wide screens."
        control={
          <Toggle
            checked={l.checksTop}
            label="Move checks up"
            onChange={(v) => update((s) => (s.layout.checksTop = v))}
          />
        }
      />
      <Row
        label={
          <>
            Close button in checks
            <span className="tag">Experimental</span>
          </>
        }
        description="Move the Close/Reopen PR button into the checks box, beside Convert to draft. Needs the redesign on."
        control={
          <Toggle
            checked={l.closeInChecks}
            label="Close button in checks"
            onChange={(v) => update((s) => (s.layout.closeInChecks = v))}
          />
        }
      />
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
      <Row
        label={
          <>
            Sticky sidebar
            <span className="tag">Experimental</span>
          </>
        }
        description="Keep the PR sidebar in view while the page scrolls."
        control={
          <Toggle
            checked={l.stickySidebar}
            label="Sticky sidebar"
            onChange={(v) => update((s) => (s.layout.stickySidebar = v))}
          />
        }
      />
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
      <Row
        label={
          <>
            Move comment box to top
            <span className="tag">Experimental</span>
          </>
        }
        description="Show the “Add a comment” box above the timeline."
        control={
          <Toggle
            checked={l.composeTop}
            label="Move comment box to top"
            onChange={(v) => update((s) => (s.layout.composeTop = v))}
          />
        }
      />
      <Row
        label="Hide guidelines & ProTip"
        description="Hide the Community Guidelines reminder and the ProTip line."
        control={
          <Toggle
            checked={l.hideNotices}
            label="Hide guidelines & ProTip"
            onChange={(v) => update((s) => (s.layout.hideNotices = v))}
          />
        }
      />
      <Row
        label="Hide footer"
        description="Hide GitHub's page footer."
        control={
          <Toggle
            checked={l.hideFooter}
            label="Hide footer"
            onChange={(v) => update((s) => (s.layout.hideFooter = v))}
          />
        }
      />
    </Group>
  );
}

function SidebarGroup({ settings, update }: GroupProps) {
  return (
    <Group
      title="Pull Request Sidebar"
      description="Turn a section off to hide it on PR & issue pages."
    >
      {SIDEBAR_SECTIONS.map((section) => {
        const visible = settings.sidebar.sections[section.key] ?? true;
        return (
          <Row
            key={section.key}
            label={section.label}
            description={visible ? 'Shown' : 'Hidden'}
            control={
              <Toggle
                checked={visible}
                label={`Show ${section.label}`}
                onChange={(v) => update((s) => (s.sidebar.sections[section.key] = v))}
              />
            }
          />
        );
      })}
    </Group>
  );
}

function CommentsGroup({ settings, update }: GroupProps) {
  return (
    <Group
      title="Comments"
      description="Add a one-click hide button to pull request comments."
    >
      <Row
        label="Hide-as-outdated button"
        description="Shows a “Hide” button on each comment that minimizes it as outdated."
        control={
          <Toggle
            checked={settings.hideComments.enabled}
            label="Hide-as-outdated button"
            onChange={(v) => update((s) => (s.hideComments.enabled = v))}
          />
        }
      />
    </Group>
  );
}

function App() {
  const { settings, update } = useSettings();

  return (
    <div className="app">
      <header className="app-header">
        <Logo />
        <h1>GitHub Enhance</h1>
        <span className="version">v{VERSION}</span>
      </header>

      {settings && (
        <>
          <AppearanceGroup settings={settings} update={update} />
          <DatesGroup settings={settings} update={update} />
          <LayoutGroup settings={settings} update={update} />
          <SidebarGroup settings={settings} update={update} />
          <CommentsGroup settings={settings} update={update} />
        </>
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
