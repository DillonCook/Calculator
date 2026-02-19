import type { DealResult, StrategyKey } from '@/lib/models/deal';
import { currencyFormatter, percentFormatter } from '@/lib/formatters';

const labelMap: Record<StrategyKey, string> = {
  purchase: 'Purchase Analysis',
  longTerm: 'Long-Term Rental',
  airbnb: 'Airbnb / Short-Term',
  padSplit: 'PadSplit',
  brrrr: 'BRRRR',
  flip: 'Flip'
};

interface StrategyBreakdownProps {
  data: DealResult;
  active: StrategyKey;
}

const quickScanMap: Record<StrategyKey, { title: string; points: string[] }> = {
  purchase: {
    title: 'Quick scan',
    points: ['Baseline acquisition math for financing and all strategy overlays.']
  },
  longTerm: {
    title: 'Quick scan',
    points: ['Stable buy-and-hold income model with recurring rental revenue.', 'Best fit for lower-turnover operations and reserve planning.']
  },
  airbnb: {
    title: 'Quick scan',
    points: ['Higher upside from nightly rates and occupancy optimization.', 'Needs stronger operations for cleaning, platform fees, and turns.']
  },
  padSplit: {
    title: 'Quick scan',
    points: ['Room-by-room rent model that boosts revenue per property.', 'Operational intensity is driven by occupancy and turnover costs.']
  },
  brrrr: {
    title: 'Quick scan',
    points: ['Acquire, renovate, refinance, and hold to recycle capital.', 'Key lever is refi LTV and post-refi operating performance.']
  },
  flip: {
    title: 'Quick scan',
    points: ['Value creation through rehab and resale margin.', 'Profit depends on timeline control and disciplined exit costs.']
  }
};

export function StrategyBreakdown({ data, active }: StrategyBreakdownProps) {
  const output = data[active];
  const quickScan = quickScanMap[active];

  return (
    <section className="overflow-hidden rounded-2xl panel-surface p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">{quickScan.title}</p>
          <h2 className="text-xl font-semibold">{labelMap[active]}</h2>
        </div>
        <p className="max-w-xl text-sm text-muted">{output.notes}</p>
      </div>

      <ul className="mt-4 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-200">
        {quickScan.points.map((point) => (
          <li key={point} className="flex gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Monthly cash flow"
          value={currencyFormatter.format(output.monthlyCashFlow)}
          secondaryValue={
            active === 'longTerm' || active === 'airbnb' || active === 'padSplit' || active === 'brrrr'
              ? currencyFormatter.format(output.monthlyCashFlowExcludingReserves ?? output.monthlyCashFlow)
              : undefined
          }
          secondaryLabel={
            active === 'longTerm' || active === 'airbnb' || active === 'padSplit' || active === 'brrrr'
              ? 'No reserves'
              : undefined
          }
          secondaryTooltip={
            active === 'longTerm' || active === 'airbnb' || active === 'padSplit' || active === 'brrrr'
              ? 'Monthly cash flow excluding maintenance and CapEx reserves. Helpful for newer homes that may not need reserve allocations right away.'
              : undefined
          }
        />
        <Metric label="Cash needed" value={currencyFormatter.format(output.totalCashNeeded)} />
        <Metric label="Cash on cash" value={percentFormatter.format(output.cashOnCashReturn)} />
        <Metric label="DSCR" value={output.dscr.toFixed(2)} />
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  secondaryValue,
  secondaryLabel,
  secondaryTooltip
}: {
  label: string;
  value: string;
  secondaryValue?: string;
  secondaryLabel?: string;
  secondaryTooltip?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="truncate text-2xl font-semibold">{value}</p>
        {secondaryValue && secondaryLabel ? (
          <div className="flex shrink-0 items-center gap-1 text-right">
            <p className="text-[11px] font-medium text-muted">
              {secondaryLabel}: <span className="text-slate-300">{secondaryValue}</span>
            </p>
            {secondaryTooltip ? (
              <span
                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] text-muted"
                title={secondaryTooltip}
                aria-label={secondaryTooltip}
              >
                i
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
