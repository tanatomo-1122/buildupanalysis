import type { ReactNode } from 'react';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-edge bg-panel2/60 p-3">
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Card({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-edge bg-panel2/60">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-edge px-4 py-3">
        <div>
          <h2 className="text-[13px] font-semibold text-slate-200">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  hint?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-slate-200">{label}</span>
        <span className="font-mono text-[12px] text-slate-400">
          {value.toFixed(step >= 1 ? 0 : step >= 0.1 ? 1 : 2)}
          {unit ?? ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="mt-1 text-[11px] leading-snug text-slate-500">{hint}</p>}
    </label>
  );
}

export function Toggle({
  label,
  checked,
  hint,
  onChange,
}: {
  label: string;
  checked: boolean;
  hint?: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-sky-400"
      />
      <span>
        <span className="text-[13px] text-slate-200">{label}</span>
        {hint && <span className="block text-[11px] leading-snug text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  hint,
  onChange,
}: {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  hint?: string;
  onChange: (v: T) => void;
}) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-[13px] text-slate-200">{label}</span>}
      <select className="w-full" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1 text-[11px] leading-snug text-slate-500">{hint}</p>}
    </label>
  );
}

export function TextField({
  label,
  value,
  placeholder,
  hint,
  onChange,
  onEnter,
}: {
  label?: string;
  value: string;
  placeholder?: string;
  hint?: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
}) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-[13px] text-slate-200">{label}</span>}
      <input
        type="text"
        className="w-full rounded-md border border-edge bg-panel2 px-2.5 py-1.5 text-[13px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500/60"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) onEnter();
        }}
      />
      {hint && <p className="mt-1 text-[11px] leading-snug text-slate-500">{hint}</p>}
    </label>
  );
}

export function Button({
  children,
  onClick,
  tone = 'default',
  disabled,
  size = 'sm',
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const base =
    'rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  const sizing = size === 'md' ? 'px-4 py-2 text-[13px]' : 'px-2.5 py-1.5 text-[12px]';
  const styles =
    tone === 'primary'
      ? 'border-sky-500/60 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25'
      : tone === 'danger'
        ? 'border-rose-500/50 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20'
        : 'border-edge bg-panel2 text-slate-300 hover:bg-[#243040]';
  return (
    <button
      type="button"
      className={`${base} ${sizing} ${styles}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'error';
  children: ReactNode;
}) {
  const styles =
    tone === 'error'
      ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
      : tone === 'warn'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
        : 'border-edge bg-panel2/60 text-slate-400';
  return (
    <div className={`rounded-md border p-3 text-[12px] leading-relaxed ${styles}`}>{children}</div>
  );
}
