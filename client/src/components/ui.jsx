import { useId } from 'react';

export function Field({ label, error, hint, children, className = '' }) {
  const id = useId();
  const control = typeof children === 'function' ? children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-err` : undefined }) : children;
  return (
    <div className={`field ${className}`}>
      <label className="f" htmlFor={id}>{label}</label>
      {control}
      {error ? <div className="err" id={`${id}-err`} role="alert">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export function TextInput({ label, error, hint, className, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(a) => <input {...a} {...props} className={error ? 'bad' : ''} />}
    </Field>
  );
}

export function Select({ label, error, hint, options, className, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(a) => (
        <select {...a} {...props} className={error ? 'bad' : ''}>
          {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      )}
    </Field>
  );
}

const CHIP = { active: 'Active', reserved: 'Reserved', collected: 'Collected', expired: 'Expired', withdrawn: 'Withdrawn', pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
export const Chip = ({ status }) => <span className={`chip s-${status}`}>{CHIP[status] || status}</span>;

export const Tag = ({ children, donate }) => <span className={`tag ${donate ? 'donate' : ''}`}>{children}</span>;

export function Banner({ kind = 'ok', title, children }) {
  return (
    <div className={`banner ${kind}`} role={kind === 'warn' ? 'alert' : 'status'}>
      {title && <b>{title} </b>}{children}
    </div>
  );
}

export function PageHead({ title, sub, owner, children }) {
  return (
    <div className="pagehead">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {children}
      {owner && <span className="owner">{owner}</span>}
    </div>
  );
}

export const Empty = ({ title, children }) => (
  <div className="empty"><b>{title}</b>{children && <p>{children}</p>}</div>
);

export const Spinner = ({ label = 'Loading…' }) => <div className="spinner" role="status">{label}</div>;
