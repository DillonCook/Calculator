'use client';

import type { StrategyCalculationLineItem, StrategyKey, StrategyOutput } from '@/lib/models/deal';
import { currencyFormatter } from '@/lib/formatters';

const strategyLabels: Record<StrategyKey, string> = {
  purchase: 'Purchase',
  longTerm: 'Long-Term',
  airbnb: 'Airbnb / STR',
  padSplit: 'PadSplit',
  brrrr: 'BRRRR',
  flip: 'Flip'
};

interface StrategyWorkLightboxProps {
  open: boolean;
  activeStrategy: StrategyKey;
  output: StrategyOutput;
  onClose: () => void;
}

const Row = ({ line }: { line: StrategyCalculationLineItem }) => (
  <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs sm:text-sm">
    <p className="text-slate-100">{line.label}</p>
    <p className={`text-right ${line.monthly >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{currencyFormatter.format(line.monthly)}</p>
    <p className={`text-right ${line.annual >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{currencyFormatter.format(line.annual)}</p>
  </div>
);


const FlipFinancials = ({ breakdown }: { breakdown: NonNullable<StrategyOutput['calculationBreakdown']> }) => {
  const meta = breakdown.flipMeta;

  if (!meta) return null;

  const holdingMonths = Math.max(meta.holdingMonths, 1);

  const costItems = [
    { key: 'purchase', label: 'Purchase price', total: meta.purchasePrice },
    { key: 'rehab', label: 'Rehab budget', total: meta.rehabBudget },
    { key: 'buy-close', label: 'Buy closing costs', total: meta.buyClosingCosts },
    { key: 'agent', label: 'Agent commission', total: meta.agentCommission },
    { key: 'sell-close', label: 'Sell closing costs', total: meta.sellClosingCosts },
    { key: 'concessions', label: 'Seller concessions', total: meta.sellerConcessions }
  ];

  const holdingItems = [
    { key: 'fixed', label: 'Fixed holding costs', monthly: meta.fixedHoldingCostsMonthly, total: meta.fixedHoldingCostsMonthly * holdingMonths },
    { key: 'variable', label: 'Variable expenses', monthly: meta.variableHoldingCostsMonthly, total: meta.variableHoldingCostsMonthly * holdingMonths },
    { key: 'lender', label: 'Lender costs (debt service)', monthly: meta.lenderHoldingCostsMonthly, total: meta.lenderHoldingCostsMonthly * holdingMonths }
  ];

  const totalCosts = costItems.reduce((sum, item) => sum + item.total, 0) + meta.holdingCostsTotal;

  return (
    <div className="space-y-3"> 
      <div className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Sale price</p>
          <p className="text-lg font-semibold text-emerald-300">{currencyFormatter.format(meta.salePrice)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Total costs</p>
          <p className="text-lg font-semibold text-rose-300">-{currencyFormatter.format(totalCosts)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Holding period</p>
          <p className="text-lg font-semibold text-slate-100">{holdingMonths} mo</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Net profit</p>
          <p className={`text-lg font-semibold ${meta.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{currencyFormatter.format(meta.netProfit)}</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">One-time costs</p>
          {costItems.map((item) => (
            <div key={item.key} className="grid grid-cols-[1fr_auto] gap-2 text-sm">
              <p className="text-slate-100">{item.label}</p>
              <p className="text-right text-rose-300">-{currencyFormatter.format(item.total)}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Holding costs ({holdingMonths} mo)</p>
          {holdingItems.map((item) => (
            <div key={item.key} className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm">
              <p className="text-slate-100">{item.label}</p>
              <p className="text-right text-muted">{currencyFormatter.format(item.monthly)}/mo</p>
              <p className="text-right text-rose-300">-{currencyFormatter.format(item.total)}</p>
            </div>
          ))}
          <div className="mt-1 grid grid-cols-[1fr_auto_auto] gap-2 border-t border-white/10 pt-2 text-sm">
            <p className="text-slate-100">Holding costs total</p>
            <p className="text-right text-muted">{currencyFormatter.format(meta.holdingCostsTotal / holdingMonths)}/mo</p>
            <p className="text-right font-semibold text-rose-300">-{currencyFormatter.format(meta.holdingCostsTotal)}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Net profit formula</p>
        <p className="mt-1 text-sm text-slate-200">
          {currencyFormatter.format(meta.salePrice)} - {currencyFormatter.format(totalCosts)} ={' '}
          <span className={`font-semibold ${meta.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{currencyFormatter.format(meta.netProfit)}</span>
        </p>
      </div>
    </div>
  );
};

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
            <p className="text-sm text-muted">Line-item math behind each strategy&apos;s outcome, including detailed flip net profit math.</p>
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
                <p className="text-lg font-semibold text-emerald-300">{currencyFormatter.format(breakdown.revenueMonthly)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Seller-paid / mo</p>
                <p className="text-lg font-semibold text-rose-300">{currencyFormatter.format(-Math.abs(breakdown.sellerPaidExpensesMonthly))}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Debt service / mo</p>
                <p className="text-lg font-semibold text-rose-300">{currencyFormatter.format(-Math.abs(breakdown.debtServiceMonthly))}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">NOI / mo</p>
                <p className={`text-lg font-semibold ${breakdown.noiMonthly >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{currencyFormatter.format(breakdown.noiMonthly)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Cash flow / mo</p>
                <p className={`text-lg font-semibold ${breakdown.cashFlowMonthly >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{currencyFormatter.format(breakdown.cashFlowMonthly)}</p>
              </div>
            </div>

            {activeStrategy === 'flip' && breakdown.flipMeta ? (
              <FlipFinancials breakdown={breakdown} />
            ) : (
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}

