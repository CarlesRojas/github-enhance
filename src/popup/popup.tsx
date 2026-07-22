import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './popup.css';
import {
  DATE_FORMATS,
  DEFAULT_SETTINGS,
  SIDEBAR_SECTIONS,
  Settings,
  TIME_FORMATS,
  effectiveDatePattern,
  loadSettings,
  saveSettings,
} from '../shared/settings';
import { formatDate } from '../shared/formatDate';
import { Group, Row, Select, Toggle } from './components';

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

function DatesGroup({ settings, update }: GroupProps) {
  const d = settings.dates;

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
            label="Date format"
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
            label="Time format"
            onChange={(v) => update((s) => (s.dates.timeFormat = v))}
          />
        }
      />

      {d.enabled && (
        <div className="preview">
          <span className="from">yesterday</span>
          <span className="arrow">→</span>
          <span className="to">{formatDate(new Date(), effectiveDatePattern(settings))}</span>
        </div>
      )}
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

function TimelineGroup({ settings, update }: GroupProps) {
  return (
    <Group
      title="Timeline"
      description="Reorder the PR conversation: description, checks, then the compose box above a newest-first timeline."
    >
      <Row
        label={
          <>
            Reverse timeline order
            <span className="tag">Experimental</span>
          </>
        }
        control={
          <Toggle
            checked={settings.timeline.enabled}
            label="Reverse timeline order"
            onChange={(v) => update((s) => (s.timeline.enabled = v))}
          />
        }
      />
      <p className="hint">
        Rearranges the conversation on load. If a page looks off, turn this off
        and reload.
      </p>
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
          <DatesGroup settings={settings} update={update} />
          <SidebarGroup settings={settings} update={update} />
          <CommentsGroup settings={settings} update={update} />
          <TimelineGroup settings={settings} update={update} />
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
