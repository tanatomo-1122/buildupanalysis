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
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] text-slate-200">{label}</span>
      <select
        className="w-full"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Button({
  children,
  onClick,
  tone = 'default',
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: 'default' | 'primary';
}) {
  const base =
    'rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40';
  const styles =
    tone === 'primary'
      ? 'border-sky-500/60 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25'
      : 'border-edge bg-panel2 text-slate-300 hover:bg-[#243040]';
  return (
    <button type="button" className={`${base} ${styles}`} onClick={onClick}>
      {children}
    </button>
  );
}
