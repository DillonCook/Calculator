import type { MasterAssumptions, StrategyOutput } from '@/lib/models/deal';
import { currencyFormatter } from '@/lib/formatters';

interface TimelineCardProps {
  output: StrategyOutput;
  assumptions: MasterAssumptions;
  onAssumptionsChange: (updates: Partial<MasterAssumptions>) => void;
}

export function TimelineCard({ output, assumptions, onAssumptionsChange }: TimelineCardProps) {
  return (
    <details className="rounded-2xl panel-surface p-5 shadow-soft" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">IRR Stream & Exit Assumptions</h3>
        <p className="text-xs text-muted">IRR-ready stream</p>
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
