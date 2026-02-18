'use client';

import type { StrategyCalculationLineItem, StrategyKey, StrategyOutput } from '@/lib/models/deal';

const strategyLabels: Record<StrategyKey, string> = {
  purchase: 'Purchase',
  longTerm: 'Long-Term',
  airbnb: 'Airbnb / STR',
  padSplit: 'PadSplit',
  brrrr: 'BRRRR',
  flip: 'Flip'
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

interface StrategyWorkLightboxProps {
  open: boolean;
  activeStrategy: StrategyKey;
  output: StrategyOutput;
  onClose: () => void;
}

const Row = ({ line }: { line: StrategyCalculationLineItem }) => (
  <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs sm:text-sm">
    <p className="text-slate-100">{line.label}</p>
    <p className={`text-right ${line.monthly >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{currency.format(line.monthly)}</p>
    <p className={`text-right ${line.annual >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{currency.format(line.annual)}</p>
  </div>
);

export function StrategyWorkLightbox({ open, activeStrategy, output, onClose }: StrategyWorkLightboxProps) {
  if (!open) return null;

  const breakdown = output.calculationBreakdown;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#040814]/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Strategy Work Lightbox">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/10 bg-panel p-5 shadow-soft">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-accent">Show your work</p>
            <h3 className="text-xl font-semibold">{strategyLabels[activeStrategy]} calculations</h3>
            <p className="text-sm text-muted">Monthly + annual line-item math behind NOI, seller-paid expenses, and cash flow.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-muted transition hover:bg-white/10">
            Close
          </button>
        </div>

        {!breakdown ? (
          <p className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm text-muted">No breakdown available for this strategy yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Revenue / mo</p>
                <p className="text-lg font-semibold text-emerald-300">{currency.format(breakdown.revenueMonthly)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Seller-paid / mo</p>
                <p className="text-lg font-semibold text-rose-300">{currency.format(-Math.abs(breakdown.sellerPaidExpensesMonthly))}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Debt service / mo</p>
                <p className="text-lg font-semibold text-rose-300">{currency.format(-Math.abs(breakdown.debtServiceMonthly))}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">NOI / mo</p>
                <p className={`text-lg font-semibold ${breakdown.noiMonthly >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{currency.format(breakdown.noiMonthly)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Cash flow / mo</p>
                <p className={`text-lg font-semibold ${breakdown.cashFlowMonthly >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{currency.format(breakdown.cashFlowMonthly)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 px-3 text-[11px] uppercase tracking-wide text-muted">
                <p>Line item</p>
                <p className="text-right">Monthly</p>
                <p className="text-right">Annual</p>
              </div>
              {breakdown.lines.map((line) => (
                <Row key={line.key} line={line} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

