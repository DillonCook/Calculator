'use client';

export const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-accent placeholder:text-muted focus:ring-2';

export function Input({
  label,
  value,
  onChange,
  type = 'text'
}: {
  label: string;
  value: number | string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-muted">{label}</span>
      <input className={inputClass} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
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
  const displayValue = Number.isFinite(value) ? Math.round(value * 100) : 0;

  return (
    <label className="space-y-1">
      <span className="text-xs text-muted">{label}</span>
      <input
        className={inputClass}
        type="number"
        step="1"
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
      <span className="text-xs text-muted">{label}</span>
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-panel">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
