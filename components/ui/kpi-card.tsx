'use client';

import { useEffect, useRef } from 'react';

interface KpiDefinition {
  term: string;
  description: string;
}

interface KpiCardProps {
  label: string;
  value: string;
  tone?: 'default' | 'success';
  helper?: string;
  winner?: string;
  secondaryLabel?: string;
  secondaryValue?: string;
  definitions?: KpiDefinition[];
  valueTestId?: string;
}

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function KpiCard({ label, value, helper, winner, tone = 'default', secondaryLabel, secondaryValue, definitions, valueTestId }: KpiCardProps) {
  const primaryValueRef = useRef<HTMLParagraphElement | null>(null);
  const secondaryValueRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (typeof primaryValueRef.current?.animate === 'function') {
      primaryValueRef.current.animate(
      [
        { opacity: 0.55, transform: 'translateY(4px) scale(0.985)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' }
      ],
      { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    }

    if (typeof secondaryValueRef.current?.animate === 'function') {
      secondaryValueRef.current.animate(
      [
        { opacity: 0.55, transform: 'translateY(4px) scale(0.985)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' }
      ],
      { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    }
  }, [value, secondaryValue]);

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl card-surface p-2.5 shadow-soft sm:p-3">
      <div className="flex min-w-0 items-center gap-2">
        <p className="min-w-0 truncate text-[11px] uppercase tracking-wide text-muted sm:text-xs">{label}</p>
        {definitions?.length ? (
          <div className="group/tooltip relative">
            <button
              type="button"
              aria-label={`${label} definitions`}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-white/[0.03] text-[10px] font-semibold text-muted transition hover:border-accent/70 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              i
            </button>
            <div className="pointer-events-none absolute left-0 top-6 z-20 w-[260px] rounded-lg border border-white/10 bg-[#0F1A31]/95 p-3 text-xs text-slate-200 opacity-0 shadow-soft backdrop-blur transition duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100">
              {definitions.map((definition) => (
                <p key={definition.term} className="leading-relaxed [&:not(:first-child)]:mt-2">
                  <span className="font-semibold text-white">{definition.term}:</span> {definition.description}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {winner ? (
        <p className="mt-1 text-[11px] italic tracking-wide text-accent/90 sm:text-xs" aria-label={`${label} strategy context`}>
          {winner}
        </p>
      ) : null}

      <p
        ref={primaryValueRef}
        className={`mt-1 text-[clamp(1rem,5vw,1.35rem)] font-semibold leading-tight sm:text-[1.65rem] md:text-[2rem] ${tone === 'success' ? 'text-emerald-300' : 'text-white'}`}
        data-testid={valueTestId ?? `kpi-${slugify(label)}`}
      >
        {value}
      </p>

      {secondaryLabel && secondaryValue ? (
        <div className="mt-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 sm:px-2.5 sm:py-1.5">
          <p className="text-[10px] uppercase tracking-wide text-muted sm:text-[11px]">{secondaryLabel}</p>
          <p ref={secondaryValueRef} className="text-xs font-semibold text-white sm:text-base" data-testid={`kpi-${slugify(secondaryLabel)}`}>
            {secondaryValue}
          </p>
        </div>
      ) : null}

      {helper ? <p className="mt-1.5 text-[11px] text-muted sm:text-xs">{helper}</p> : null}
    </div>
  );
}
