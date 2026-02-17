import type { DealResult, StrategyKey } from '@/lib/models/deal';

const labelMap: Record<StrategyKey, string> = {
  purchase: 'Purchase Analysis',
  longTerm: 'Long-Term Rental',
  airbnb: 'Airbnb / Short-Term',
  padSplit: 'PadSplit',
  brrrr: 'BRRRR',
  flip: 'Flip'
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

interface StrategyBreakdownProps {
  data: DealResult;
  active: StrategyKey;
}

export function StrategyBreakdown({ data, active }: StrategyBreakdownProps) {
  const output = data[active];

  return (
    <section className="rounded-2xl border border-white/10 bg-panel p-5 shadow-soft">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">Module Details</p>
          <h2 className="text-xl font-semibold">{labelMap[active]}</h2>
        </div>
        <p className="max-w-xs text-right text-sm text-muted">{output.notes}</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Monthly Cash Flow" value={money.format(output.monthlyCashFlow)} />
        <Metric label="Annual Cash Flow" value={money.format(output.annualCashFlow)} />
        <Metric label="Cash Needed" value={money.format(output.totalCashNeeded)} />
        <Metric label="Sale Proceeds" value={money.format(output.saleProceeds ?? 0)} />
        <Metric label="Cap Rate" value={pct.format(output.capRate)} />
        <Metric label="Cash on Cash" value={pct.format(output.cashOnCashReturn)} />
        <Metric label="DSCR" value={output.dscr.toFixed(2)} />
        <Metric label="ROI" value={pct.format(output.roi)} />
        <Metric label="IRR" value={pct.format(output.irr)} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}
