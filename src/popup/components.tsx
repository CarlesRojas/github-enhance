// Small presentational building blocks for the popup.
import { ReactNode, useEffect, useState } from 'react';

export function Group(props: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="group">
      <h2 className="group-title">{props.title}</h2>
      {props.description && <p className="group-desc">{props.description}</p>}
      {props.children}
    </section>
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
