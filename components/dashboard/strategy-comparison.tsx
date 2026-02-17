import type { DealResult } from '@/lib/models/deal';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

const rows: { key: keyof Omit<DealResult, 'masterSummary'>; label: string }[] = [
  { key: 'longTerm', label: 'Long-Term Rental' },
  { key: 'airbnb', label: 'Airbnb / STR' },
  { key: 'padSplit', label: 'PadSplit' },
  { key: 'brrrr', label: 'BRRRR' },
  { key: 'flip', label: 'Flip' }
];

interface StrategyComparisonProps {
  data: DealResult;
}

export function StrategyComparison({ data }: StrategyComparisonProps) {
  const maxCashFlow = Math.max(...rows.map((row) => data[row.key].monthlyCashFlow));

  return (
    <section className="rounded-2xl border border-white/10 bg-panel p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">Master Strategy Board</p>
          <h2 className="text-xl font-semibold">Compare all exits at a glance</h2>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const output = data[row.key];
          const barWidth = maxCashFlow === 0 ? 0 : Math.max((output.monthlyCashFlow / maxCashFlow) * 100, -100);
          const isPositive = output.monthlyCashFlow >= 0;

          return (
            <div key={row.key} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{row.label}</p>
                <p className={`text-base font-semibold ${isPositive ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {currency.format(output.monthlyCashFlow)}
                  <span className="ml-1 text-xs text-muted">/mo</span>
                </p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${isPositive ? 'bg-emerald-400' : 'bg-rose-400'}`}
                  style={{ width: `${Math.abs(barWidth)}%` }}
                />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-muted sm:grid-cols-4">
                <span>CoC {percent.format(output.cashOnCashReturn)}</span>
                <span>ROI {percent.format(output.roi)}</span>
                <span>DSCR {output.dscr.toFixed(2)}</span>
                <span className="text-right">Cap {percent.format(output.capRate)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
