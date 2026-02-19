'use client';

export const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent/60 sm:px-3 sm:py-2 sm:text-sm';

export function Input({
  label,
  value,
  onChange,
  type = 'text',
  step
}: {
  label: string;
  value: number | string;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] text-muted sm:text-xs">{label}</span>
      <input className={inputClass} type={type} step={step ?? (type === 'number' ? '0.01' : undefined)} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function PercentInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const displayValue = Number.isFinite(value) ? Number((value * 100).toFixed(2)) : 0;

  return (
    <label className="space-y-1">
      <span className="text-[11px] text-muted sm:text-xs">{label}</span>
      <input
        className={inputClass}
        type="number"
        step="0.01"
        value={displayValue}
        onChange={(event) => onChange((Number(event.target.value) || 0) / 100)}
      />
    </label>
  );
}

export function Select({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] text-muted sm:text-xs">{label}</span>
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-surface">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
