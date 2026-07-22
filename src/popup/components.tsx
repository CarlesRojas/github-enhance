// Small presentational building blocks for the popup.
import { ReactNode } from 'react';

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
