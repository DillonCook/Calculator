'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFloatingTooltipPosition } from '@/lib/use-floating-tooltip-position';

export const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-muted focus-visible:border-accent/75 focus-visible:shadow-[inset_0_0_0_1px_rgba(255,176,92,0.58)] sm:px-3 sm:py-2 sm:text-sm';

const normalizeNumberString = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return raw;
  return String(parsed);
};

function FieldLabel({ label, tooltip }: { label: string; tooltip?: string }) {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const fieldLabelRef = useRef<HTMLSpanElement | null>(null);
  const tooltipButtonRef = useRef<HTMLButtonElement | null>(null);
  const tooltipPanelRef = useRef<HTMLSpanElement | null>(null);
  const { style: tooltipStyle } = useFloatingTooltipPosition({
    open: isTooltipOpen,
    anchorRef: tooltipButtonRef,
    tooltipRef: tooltipPanelRef,
    preferredPlacement: 'bottom',
    maxWidth: 280,
    offset: 8,
    zIndex: 180
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isTooltipOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (fieldLabelRef.current?.contains(target)) return;
      if (tooltipPanelRef.current?.contains(target)) return;
      setIsTooltipOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsTooltipOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTooltipOpen]);

  return (
    <span ref={fieldLabelRef} className="relative flex items-center gap-1 text-[11px] text-muted sm:text-xs">
      <span>{label}</span>
      {tooltip ? (
        <span className="relative inline-flex items-center">
          <button
            ref={tooltipButtonRef}
            type="button"
            aria-label={`More info about ${label}`}
            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-white/[0.03] text-[9px] font-semibold text-slate-200 transition hover:border-accent/60 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsTooltipOpen((prev) => !prev);
            }}
          >
            i
          </button>
          {isTooltipOpen && isMounted
            ? createPortal(
                <span
                  ref={tooltipPanelRef}
                  role="dialog"
                  aria-modal="false"
                  className="rounded-md border border-[#304661] bg-[#0b1629] p-2 text-[11px] leading-relaxed text-slate-100 shadow-[0_10px_24px_rgba(3,9,18,0.62)]"
                  style={tooltipStyle}
                >
                  {tooltip}
                </span>,
                document.body
              )
            : null}
        </span>
      ) : null}
    </span>
  );
}

export function Input({
  label,
  value,
  onChange,
  type = 'text',
  step,
  tooltip
}: {
  label: string;
  value: number | string;
  onChange: (value: string) => void;
  type?: string;
  step?: string;
  tooltip?: string;
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
      <FieldLabel label={label} tooltip={tooltip} />
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
  onChange,
  tooltip
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  tooltip?: string;
}) {
  const [draftValue, setDraftValue] = useState(Number.isFinite(value) ? Number((value * 100).toFixed(2)).toString() : '0');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (isFocused) return;
    setDraftValue(Number.isFinite(value) ? Number((value * 100).toFixed(2)).toString() : '0');
  }, [value, isFocused]);

  return (
    <label className="space-y-1">
      <FieldLabel label={label} tooltip={tooltip} />
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
  options,
  tooltip
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  tooltip?: string;
}) {
  return (
    <label className="space-y-1">
      <FieldLabel label={label} tooltip={tooltip} />
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
