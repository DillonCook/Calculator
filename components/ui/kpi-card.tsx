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
}

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function KpiCard({ label, value, helper, winner, tone = 'default', secondaryLabel, secondaryValue, definitions }: KpiCardProps) {
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
    <div className="rounded-2xl border border-white/10 bg-panel p-4 shadow-soft">
      <div className="flex items-center gap-2">
        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
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
        <p className="mt-1 text-xs italic tracking-wide text-accent/90" aria-label={`${label} strategy context`}>
          {winner}
        </p>
      ) : null}

      <p
        ref={primaryValueRef}
        className={`mt-1 text-3xl font-semibold md:text-4xl ${tone === 'success' ? 'text-emerald-300' : 'text-white'}`}
        data-testid={`kpi-${slugify(label)}`}
      >
        {value}
      </p>

      {secondaryLabel && secondaryValue ? (
        <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted">{secondaryLabel}</p>
          <p ref={secondaryValueRef} className="text-lg font-semibold text-white" data-testid={`kpi-${slugify(secondaryLabel)}`}>
            {secondaryValue}
          </p>
        </div>
      ) : null}

      {helper ? <p className="mt-2 text-xs text-muted">{helper}</p> : null}
    </div>
  );
}
