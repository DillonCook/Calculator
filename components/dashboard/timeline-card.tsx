import { useEffect, useState } from 'react';
import type { MasterAssumptions, StrategyOutput } from '@/lib/models/deal';
import { currencyFormatter } from '@/lib/formatters';

interface TimelineCardProps {
  output: StrategyOutput;
  assumptions: MasterAssumptions;
  onAssumptionsChange: (updates: Partial<MasterAssumptions>) => void;
  defaultOpen?: boolean;
}

export function TimelineCard({ output, assumptions, onAssumptionsChange, defaultOpen = true }: TimelineCardProps) {
  const [isIrrTooltipOpen, setIsIrrTooltipOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [holdYearsDraft, setHoldYearsDraft] = useState(String(assumptions.holdYears));
  const [isHoldYearsFocused, setIsHoldYearsFocused] = useState(false);

  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);

  useEffect(() => {
    if (isHoldYearsFocused) return;
    setHoldYearsDraft(String(assumptions.holdYears));
  }, [assumptions.holdYears, isHoldYearsFocused]);

  return (
    <details className="min-w-0 max-w-full overflow-hidden rounded-2xl panel-surface p-3 shadow-soft sm:p-5" open={isOpen}>
      <summary
        className="mb-4 flex cursor-pointer list-none flex-wrap items-start justify-between gap-3"
        onClick={(event) => {
          event.preventDefault();
          setIsOpen((prev) => !prev);
        }}
      >
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">Cash Flow Timeline</p>
          <h3 className="text-lg font-semibold sm:text-xl">IRR Stream</h3>
        </div>
        <div className="relative shrink-0 self-start">
          <button
            type="button"
            aria-label="IRR stream explanation"
            aria-expanded={isIrrTooltipOpen}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsIrrTooltipOpen((prev) => !prev);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/[0.03] text-[10px] font-semibold text-muted opacity-85 transition hover:border-accent/70 hover:text-accent hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            i
          </button>

          {isIrrTooltipOpen ? (
            <>
              <button
                type="button"
                aria-label="Close tooltip"
                className="fixed inset-0 z-20 bg-black/45 sm:hidden"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setIsIrrTooltipOpen(false);
                }}
              />
              <div className="fixed left-1/2 top-1/2 z-30 w-[min(92vw,340px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-700 bg-slate-950 p-3.5 text-xs leading-relaxed text-slate-100 shadow-soft sm:absolute sm:right-0 sm:top-7 sm:w-[300px] sm:translate-x-0 sm:translate-y-0 sm:rounded-lg sm:bg-[#0A1326] sm:p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">IRR stream details</p>
                  <button
                    type="button"
                    className="rounded-md border border-white/15 px-2 py-0.5 text-[11px] text-slate-200"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setIsIrrTooltipOpen(false);
                    }}
                  >
                    Close
                  </button>
                </div>
                <p>
                  <span className="font-semibold text-white">Why IRR stream matters:</span> it captures the timing of every yearly cash flow and your exit proceeds,
                  so two deals with the same total profit can rank very differently. IRR helps you spot faster capital velocity and lower hold-time risk.
                </p>
              </div>
            </>
          ) : null}
        </div>
      </summary>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className="text-xs text-muted">Hold years</span>
          <input
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            type="number"
            min={1}
            value={isHoldYearsFocused ? holdYearsDraft : assumptions.holdYears}
            onFocus={() => setIsHoldYearsFocused(true)}
            onChange={(event) => {
              const nextDraft = event.target.value;
              setHoldYearsDraft(nextDraft);
              if (nextDraft === '') return;
              onAssumptionsChange({ holdYears: Math.max(Number(nextDraft), 1) });
            }}
            onBlur={(event) => {
              setIsHoldYearsFocused(false);
              const nextRaw = event.target.value.trim();
              if (!nextRaw) {
                setHoldYearsDraft('1');
                onAssumptionsChange({ holdYears: 1 });
                return;
              }
              const normalized = Math.max(Number(nextRaw), 1);
              setHoldYearsDraft(String(normalized));
              onAssumptionsChange({ holdYears: normalized });
            }}
          />
        </label>

        <PercentField
          label="NOI growth %"
          value={assumptions.noiGrowthPercent}
          onChange={(value) => onAssumptionsChange({ noiGrowthPercent: value })}
        />
        <PercentField
          label="Appreciation %"
          value={assumptions.annualAppreciationPercent}
          onChange={(value) => onAssumptionsChange({ annualAppreciationPercent: value })}
        />
        <PercentField
          label="Selling cost %"
          value={assumptions.sellingCostPercent}
          onChange={(value) => onAssumptionsChange({ sellingCostPercent: value })}
        />
      </div>

      <div className="scrollbar-premium mt-3 grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {output.cashFlowTimeline.map((flow, index) => (
          <div key={index} className="rounded-lg border border-white/10 bg-white/5 p-2 text-sm">
            <p className="text-xs text-muted">Year {index}</p>
            <p className={`mt-1 font-semibold ${flow >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}>{currencyFormatter.format(flow)}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

function PercentField({ label, value, onChange }: { label: string; value: number; onChange: (next: number) => void }) {
  const [draftValue, setDraftValue] = useState(Number.isFinite(value) ? Number((value * 100).toFixed(2)).toString() : '0');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (isFocused) return;
    setDraftValue(Number.isFinite(value) ? Number((value * 100).toFixed(2)).toString() : '0');
  }, [value, isFocused]);

  return (
    <label className="space-y-1">
      <span className="text-xs text-muted">{label}</span>
      <input
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        type="number"
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
