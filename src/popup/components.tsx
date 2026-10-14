// Small presentational building blocks for the popup.
import { KeyboardEvent, ReactNode, useEffect, useState } from 'react';

export function Group(props: {
  title: string;
  description?: string;
  children: ReactNode;
  /**
   * Render the group as a disclosure, closed until the title is clicked. For
   * the long per-item lists, which would otherwise bury everything else. The
   * popup is mounted fresh each time it opens, so it always starts closed.
   */
  collapsible?: boolean;
}) {
  const body = (
    <>
      {props.description && <p className="group-desc">{props.description}</p>}
      {props.children}
    </>
  );

  if (props.collapsible) {
    return (
      <details className="group collapsible">
        <summary className="group-title">{props.title}</summary>
        {body}
      </details>
    );
  }

  return (
    <section className="group">
      <h2 className="group-title">{props.title}</h2>
      {body}
    </section>
  );
}

/** Segmented tab bar switching between the popup's pages. */
export function Tabs<K extends string>(props: {
  tabs: readonly { key: K; label: string }[];
  selected: K;
  onSelect: (key: K) => void;
}) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = props.tabs.findIndex((t) => t.key === props.selected);
    const step = e.key === 'ArrowRight' ? 1 : -1;
    const next = props.tabs[(i + step + props.tabs.length) % props.tabs.length];
    props.onSelect(next.key);
    document.getElementById(`tab-${next.key}`)?.focus();
    e.preventDefault();
  }

  return (
    <div className="tabs" role="tablist" onKeyDown={onKeyDown}>
      {props.tabs.map((t) => {
        const selected = t.key === props.selected;
        return (
          <button
            key={t.key}
            id={`tab-${t.key}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={selected}
            aria-controls={`panel-${t.key}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => props.onSelect(t.key)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function Row(props: {
  label: ReactNode;
  description?: ReactNode;
  control: ReactNode;
  indented?: boolean;
  disabled?: boolean;
}) {
  const className =
    'row' +
    (props.indented ? ' indented' : '') +
    (props.disabled ? ' disabled' : '');
  return (
    <div className={className}>
      <div className="row-main">
        <div className="row-label">{props.label}</div>
        {props.description && <div className="row-desc">{props.description}</div>}
      </div>
      <div className="row-control">{props.control}</div>
    </div>
  );
}

export function Toggle(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        aria-label={props.label}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className="slider" />
    </label>
  );
}

export function Slider(props: {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** Called when the user releases the slider — not on every drag tick, to
   * keep chrome.storage.sync writes well under its rate limits. */
  onCommit: (value: number) => void;
}) {
  const [value, setValue] = useState(props.value);
  useEffect(() => setValue(props.value), [props.value]);

  return (
    <div className="slider-control">
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={value}
        disabled={props.disabled}
        aria-label={props.ariaLabel}
        onChange={(e) => setValue(Number(e.target.value))}
        onPointerUp={() => props.onCommit(value)}
        onKeyUp={() => props.onCommit(value)}
      />
      <span className="slider-value">
        {value}
        {props.suffix}
      </span>
    </div>
  );
}

export function Select(props: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className="select"
      value={props.value}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
      onChange={(e) => props.onChange(e.target.value)}
    >
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
