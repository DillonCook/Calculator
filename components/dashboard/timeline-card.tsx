import type { StrategyOutput } from '@/lib/models/deal';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

interface TimelineCardProps {
  output: StrategyOutput;
}

export function TimelineCard({ output }: TimelineCardProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-panel p-5 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold">IRR Cashflow Timeline (Year 0..N)</h3>
        <p className="text-xs text-muted">IRR-ready stream</p>
      </div>

      <div className="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {output.cashFlowTimeline.map((flow, index) => (
          <div key={index} className="rounded-lg border border-white/10 bg-white/5 p-2 text-sm">
            <p className="text-xs text-muted">Year {index}</p>
            <p className={`mt-1 font-semibold ${flow >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{money.format(flow)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
