import type { StrategyOutput } from '@/lib/models/deal';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

interface TimelineCardProps {
  output: StrategyOutput;
  holdYears: number;
  onHoldYearsChange: (years: number) => void;
}

export function TimelineCard({ output, holdYears, onHoldYearsChange }: TimelineCardProps) {
  return (
    <details className="rounded-2xl border border-white/10 bg-panel p-5 shadow-soft" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">IRR Cashflow Timeline (Year 0..N)</h3>
        <p className="text-xs text-muted">IRR-ready stream</p>
      </summary>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <label className="max-w-[180px] space-y-1">
          <span className="text-xs text-muted">Hold years (optional)</span>
          <input
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none ring-accent focus:ring-2"
            type="number"
            min={1}
            value={holdYears}
            onChange={(event) => onHoldYearsChange(Math.max(Number(event.target.value) || 1, 1))}
          />
        </label>
        <p className="text-xs text-muted">Add years to extend the IRR stream instantly.</p>
      </div>

      <div className="scrollbar-premium mt-3 grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {output.cashFlowTimeline.map((flow, index) => (
          <div key={index} className="rounded-lg border border-white/10 bg-white/5 p-2 text-sm">
            <p className="text-xs text-muted">Year {index}</p>
            <p className={`mt-1 font-semibold ${flow >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{money.format(flow)}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
