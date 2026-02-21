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

  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);

  return (
    <details className="min-w-0 max-w-full overflow-hidden rounded-2xl panel-surface p-4 shadow-soft sm:p-5" open={isOpen}>
      <summary
        className="flex cursor-pointer list-none flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
        onClick={(event) => {
          event.preventDefault();
          setIsOpen((prev) => !prev);
        }}
      >
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 text-base font-semibold sm:text-lg">IRR Stream and Projections</h3>
          <div className="group/tooltip relative">
            <button
              type="button"
              aria-label="IRR stream explanation"
              aria-expanded={isIrrTooltipOpen}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsIrrTooltipOpen((prev) => !prev);
              }}
              onBlur={() => setIsIrrTooltipOpen(false)}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-white/[0.03] text-[10px] font-semibold text-muted transition hover:border-accent/70 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              i
            </button>
            <div
              className={`absolute left-0 top-7 z-30 w-[280px] rounded-lg border border-slate-700/80 bg-[#0A1326] p-3 text-xs leading-relaxed text-slate-100 shadow-soft transition duration-150 max-sm:fixed max-sm:inset-x-3 max-sm:bottom-4 max-sm:top-auto max-sm:w-auto max-sm:rounded-xl max-sm:border-slate-600 max-sm:p-3.5 ${
                isIrrTooltipOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100'
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2 sm:hidden">
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
          </div>
        </div>
        <p className="text-xs text-muted sm:text-right">IRR-ready stream</p>
      </summary>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className="text-xs text-muted">Hold years</span>
          <input
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            type="number"
            min={1}
            value={assumptions.holdYears}
            onChange={(event) => onAssumptionsChange({ holdYears: Math.max(Number(event.target.value) || 1, 1) })}
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
  const displayValue = Number.isFinite(value) ? Number((value * 100).toFixed(2)) : 0;

  return (
    <label className="space-y-1">
      <span className="text-xs text-muted">{label}</span>
      <input
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        type="number"
        value={displayValue}
        onChange={(event) => onChange((Number(event.target.value) || 0) / 100)}
      />
    </label>
  );
}
