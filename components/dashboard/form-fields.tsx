'use client';

import { useEffect, useState } from 'react';

export const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent/60 sm:px-3 sm:py-2 sm:text-sm';

const normalizeNumberString = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return raw;
  return String(parsed);
};

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
  const isNumber = type === 'number';
  const [draftValue, setDraftValue] = useState(String(value ?? ''));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isNumber || isFocused) return;
    setDraftValue(String(value ?? ''));
  }, [value, isFocused, isNumber]);

  const renderedValue = isNumber && isFocused ? draftValue : value;

  return (
    <label className="space-y-1">
      <span className="text-[11px] text-muted sm:text-xs">{label}</span>
      <input
        className={inputClass}
        type={type}
        step={step ?? (isNumber ? '0.01' : undefined)}
        value={renderedValue}
        onFocus={() => setIsFocused(true)}
        onChange={(event) => {
          if (!isNumber) {
            onChange(event.target.value);
            return;
          }

          const nextDraft = event.target.value;
          setDraftValue(nextDraft);
          if (nextDraft === '') return;
          onChange(nextDraft);
        }}
        onBlur={(event) => {
          if (!isNumber) return;
          setIsFocused(false);
          const normalized = normalizeNumberString(event.target.value);
          if (normalized === '') {
            if (value === '') {
              setDraftValue('');
              onChange('');
              return;
            }
            setDraftValue('0');
            onChange('0');
            return;
          }
          setDraftValue(normalized);
          onChange(normalized);
        }}
      />
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
  const [draftValue, setDraftValue] = useState(Number.isFinite(value) ? Number((value * 100).toFixed(2)).toString() : '0');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (isFocused) return;
    setDraftValue(Number.isFinite(value) ? Number((value * 100).toFixed(2)).toString() : '0');
  }, [value, isFocused]);

  return (
    <label className="space-y-1">
      <span className="text-[11px] text-muted sm:text-xs">{label}</span>
      <input
        className={inputClass}
        type="number"
        step="0.01"
        value={isFocused ? draftValue : Number.isFinite(value) ? Number((value * 100).toFixed(2)) : 0}
        onFocus={() => setIsFocused(true)}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraftValue(nextDraft);
          if (nextDraft === '') return;
          onChange(Number(nextDraft) / 100);
        }}
        onBlur={(event) => {
          setIsFocused(false);
          if (event.target.value.trim() === '') {
            onChange(0);
            setDraftValue('0');
            return;
          }
          const nextValue = Number(event.target.value);
          if (Number.isFinite(nextValue)) {
            onChange(nextValue / 100);
            setDraftValue(nextValue.toString());
          }
        }}
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
