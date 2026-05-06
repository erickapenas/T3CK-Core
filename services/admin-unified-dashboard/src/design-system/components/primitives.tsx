import { ReactNode } from 'react';
import './primitives.css';

type Tone = 'default' | 'primary' | 'success' | 'warning' | 'danger';

export function Card({
  title,
  eyebrow,
  children,
  actions,
  className = '',
}: {
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ds-card ${className}`}>
      {(title || eyebrow || actions) && (
        <header className="ds-card__header">
          <div>
            {eyebrow && <span>{eyebrow}</span>}
            {title && <h3>{title}</h3>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Button({
  children,
  tone = 'default',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button className={`ds-button ds-button--${tone}`} type="button" {...props}>
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`ds-badge ds-badge--${tone}`}>{children}</span>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className="ds-input" {...props} />;
}

export function Dropdown(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="ds-input" {...props} />;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="ds-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={active === tab.id ? 'active' : ''}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return <div className="ds-table-wrap">{children}</div>;
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="ds-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="ds-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <header>
          <h3>{title}</h3>
          <Button onClick={onClose}>Fechar</Button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function Chart({ children }: { children: ReactNode }) {
  return <div className="ds-chart">{children}</div>;
}
