'use client';

import type { StrategyCalculationLineItem, StrategyKey, StrategyOutput } from '@/lib/models/deal';
import { currencyFormatter } from '@/lib/formatters';
import { getNegativeValueStyle } from '@/lib/negative-value-color';

const strategyLabels: Record<StrategyKey, string> = {
  purchase: 'Commercial',
  longTerm: 'Long-Term',
  airbnb: 'Airbnb / STR',
  padSplit: 'PadSplit',
  brrrr: 'BRRRR',
  flip: 'Flip'
};

const brrrrOperatingLabels = {
  longTerm: 'Long-Term',
  airbnb: 'Airbnb / STR',
  padSplit: 'PadSplit'
} as const;

interface StrategyWorkLightboxProps {
  open: boolean;
  activeStrategy: StrategyKey;
  output: StrategyOutput;
  onClose: () => void;
}

const Row = ({ line }: { line: StrategyCalculationLineItem }) => (
  <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs sm:grid-cols-[1.2fr_1fr_1fr] sm:gap-2 sm:text-sm">
    <p className="text-slate-100">{line.label}</p>
    <p
      className={`text-left sm:text-right ${line.monthly >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
      style={getNegativeValueStyle(line.monthly, { kind: 'currency' })}
    >
      Monthly: {currencyFormatter.format(line.monthly)}
    </p>
    <p
      className={`text-left sm:text-right ${line.annual >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
      style={getNegativeValueStyle(line.annual, { kind: 'currency' })}
    >
      Annual: {currencyFormatter.format(line.annual)}
    </p>
  </div>
);

const formatFormulaMoney = (value: number) => (value < 0 ? `(${currencyFormatter.format(value)})` : currencyFormatter.format(value));

const BrrrrFinancials = ({ breakdown, output }: { breakdown: NonNullable<StrategyOutput['calculationBreakdown']>; output: StrategyOutput }) => {
  const meta = breakdown.brrrrMeta;

  if (!meta) return null;

  const holdingMonths = Math.max(meta.holdingMonths, 0);
  const cashInBeforeHolding =
    meta.purchaseCashComponent +
    meta.buyClosingCosts +
    meta.pointsCost +
    meta.rehabBudget +
    meta.setupCostOneTime +
    meta.helocClosingCosts -
    meta.helocOffset;
  const monthlyHoldingTotal =
    meta.monthlyHoldingExpenses + meta.fixedHoldingCostsMonthly + meta.variableHoldingCostsMonthly + meta.lenderHoldingCostsMonthly;

  const upfrontRows = [
    { key: 'purchase-cash', label: 'Purchase cash in', amount: meta.purchaseCashComponent, tone: 'neutral' as const },
    { key: 'buy-closing', label: 'Buy closing costs', amount: meta.buyClosingCosts, tone: 'neutral' as const },
    { key: 'points', label: 'Loan points', amount: meta.pointsCost, tone: 'neutral' as const },
    { key: 'rehab', label: 'Rehab budget', amount: meta.rehabBudget, tone: 'neutral' as const },
    { key: 'setup', label: 'One-time setup costs', amount: meta.setupCostOneTime, tone: 'neutral' as const },
    { key: 'heloc-offset', label: 'HELOC draw offset', amount: meta.helocOffset, tone: 'offset' as const },
    { key: 'heloc-close', label: 'HELOC closing costs', amount: meta.helocClosingCosts, tone: 'neutral' as const }
  ].filter((item) => item.amount > 0);

  const holdingRows = [
    { key: 'monthly-hold', label: 'Monthly holding expenses', monthly: meta.monthlyHoldingExpenses, total: meta.monthlyHoldingExpenses * holdingMonths },
    { key: 'fixed-hold', label: 'Fixed carrying costs', monthly: meta.fixedHoldingCostsMonthly, total: meta.fixedHoldingCostsMonthly * holdingMonths },
    { key: 'variable-hold', label: 'Variable expenses', monthly: meta.variableHoldingCostsMonthly, total: meta.variableHoldingCostsMonthly * holdingMonths },
    { key: 'lender-hold', label: 'First-loan carrying costs', monthly: meta.lenderHoldingCostsMonthly, total: meta.lenderHoldingCostsMonthly * holdingMonths }
  ].filter((item) => item.monthly > 0 || item.total > 0);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-2 xl:grid-cols-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Invested at purchase</p>
          <p className="text-lg font-semibold text-slate-100">{currencyFormatter.format(meta.investedAtPurchase)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Cash back at refi</p>
          <p
            className={`text-lg font-semibold ${meta.cashBackAtRefiNet >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
            style={getNegativeValueStyle(meta.cashBackAtRefiNet, { kind: 'currency' })}
          >
            {currencyFormatter.format(meta.cashBackAtRefiNet)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Cash left in deal</p>
          <p
            className={`text-lg font-semibold ${meta.investedAfterRefi <= 0 ? 'text-emerald-300' : 'text-slate-100'}`}
            style={meta.investedAfterRefi <= 0 ? getNegativeValueStyle(-meta.investedAfterRefi, { kind: 'currency' }) : undefined}
          >
            {currencyFormatter.format(meta.investedAfterRefi)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Post-refi ops model</p>
          <p className="text-lg font-semibold text-slate-100">{brrrrOperatingLabels[meta.operatingStrategy]}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Post-refi NOI</p>
          <p
            className={`text-lg font-semibold ${meta.selectedOperatingNoi >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
            style={getNegativeValueStyle(meta.selectedOperatingNoi, { kind: 'currency' })}
          >
            {currencyFormatter.format(meta.selectedOperatingNoi)}/mo
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Cash flow after refi</p>
          <p
            className={`text-lg font-semibold ${output.monthlyCashFlow >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
            style={getNegativeValueStyle(output.monthlyCashFlow, { kind: 'currency' })}
          >
            {currencyFormatter.format(output.monthlyCashFlow)}/mo
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Cash invested before refi</p>
          {upfrontRows.length === 0 ? (
            <p className="text-sm text-muted">No upfront BRRRR capital items beyond holding costs.</p>
          ) : (
            upfrontRows.map((item) => (
              <div key={item.key} className="grid grid-cols-[1fr_auto] gap-2 text-sm">
                <p className="text-slate-100">{item.label}</p>
                <p
                  className={`text-right ${item.tone === 'offset' ? 'text-emerald-300' : 'text-slate-100'}`}
                  style={item.tone === 'offset' ? getNegativeValueStyle(item.amount, { kind: 'currency' }) : undefined}
                >
                  {item.tone === 'offset' ? '-' : ''}
                  {currencyFormatter.format(item.amount)}
                </p>
              </div>
            ))
          )}
          <div className="mt-1 grid grid-cols-[1fr_auto] gap-2 border-t border-white/10 pt-2 text-sm">
            <p className="text-slate-100">Cash in before holding</p>
            <p className="text-right font-semibold text-slate-100">{currencyFormatter.format(cashInBeforeHolding)}</p>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Holding costs ({holdingMonths} mo)</p>
          {holdingRows.length === 0 ? (
            <p className="text-sm text-muted">No modeled holding costs before refi.</p>
          ) : (
            holdingRows.map((item) => (
              <div key={item.key} className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm">
                <p className="text-slate-100">{item.label}</p>
                <p className="text-right text-muted">{currencyFormatter.format(item.monthly)}/mo</p>
                <p className="text-right text-slate-100">{currencyFormatter.format(item.total)}</p>
              </div>
            ))
          )}
          <div className="mt-1 grid grid-cols-[1fr_auto_auto] gap-2 border-t border-white/10 pt-2 text-sm">
            <p className="text-slate-100">Holding costs total</p>
            <p className="text-right text-muted">{currencyFormatter.format(monthlyHoldingTotal)}/mo</p>
            <p className="text-right font-semibold text-slate-100">{currencyFormatter.format(meta.holdingCostsTotal)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Refi math</p>
          <div className="grid grid-cols-[1fr_auto] gap-2 text-sm">
            <p className="text-slate-100">BRRRR ARV</p>
            <p className="text-right text-slate-100">{currencyFormatter.format(meta.arvAtRefi)}</p>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 text-sm">
            <p className="text-slate-100">Refi loan amount</p>
            <p className="text-right text-slate-100">{currencyFormatter.format(meta.refiLoanAmount)}</p>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 text-sm">
            <p className="text-slate-100">Refi closing costs</p>
            <p className="text-right text-slate-100">{currencyFormatter.format(meta.refiClosingCosts)}</p>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 text-sm">
            <p className="text-slate-100">First-loan payoff</p>
            <p className="text-right text-slate-100">{currencyFormatter.format(meta.initialLoanPayoff)}</p>
          </div>
          <div className="mt-1 grid grid-cols-[1fr_auto] gap-2 border-t border-white/10 pt-2 text-sm">
            <p className="text-slate-100">Cash back at refi</p>
            <p
              className={`text-right font-semibold ${meta.cashBackAtRefiNet >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
              style={getNegativeValueStyle(meta.cashBackAtRefiNet, { kind: 'currency' })}
            >
              {currencyFormatter.format(meta.cashBackAtRefiNet)}
            </p>
          </div>
          {meta.arvAtRefi <= 0 ? (
            <p className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
              No BRRRR ARV entered yet. Refi proceeds are zero, so cash back currently only reflects the first-loan payoff.
            </p>
          ) : null}
        </div>

        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Post-refi operating math</p>
          <div className="grid grid-cols-[1fr_auto] gap-2 text-sm">
            <p className="text-slate-100">Operating model</p>
            <p className="text-right text-slate-100">{brrrrOperatingLabels[meta.operatingStrategy]}</p>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 text-sm">
            <p className="text-slate-100">Selected NOI</p>
            <p
              className={`text-right ${meta.selectedOperatingNoi >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
              style={getNegativeValueStyle(meta.selectedOperatingNoi, { kind: 'currency' })}
            >
              {currencyFormatter.format(meta.selectedOperatingNoi)}/mo
            </p>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 text-sm">
            <p className="text-slate-100">Refi debt service</p>
            <p className="text-right text-slate-100">{currencyFormatter.format(meta.refinanceDebt)}/mo</p>
          </div>
          <div className="mt-1 grid grid-cols-[1fr_auto] gap-2 border-t border-white/10 pt-2 text-sm">
            <p className="text-slate-100">Cash flow</p>
            <p
              className={`text-right font-semibold ${output.monthlyCashFlow >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
              style={getNegativeValueStyle(output.monthlyCashFlow, { kind: 'currency' })}
            >
              {currencyFormatter.format(output.monthlyCashFlow)}/mo
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Cash left in deal formula</p>
        <p className="mt-1 text-sm text-slate-200">
          {formatFormulaMoney(meta.investedAtPurchase)} - {formatFormulaMoney(meta.cashBackAtRefiNet)} ={' '}
          <span
            className={`font-semibold ${meta.investedAfterRefi <= 0 ? 'text-emerald-300' : 'text-slate-100'}`}
            style={meta.investedAfterRefi <= 0 ? getNegativeValueStyle(-meta.investedAfterRefi, { kind: 'currency' }) : undefined}
          >
            {formatFormulaMoney(meta.investedAfterRefi)}
          </span>
        </p>
      </div>
    </div>
  );
};


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
          <p className="text-lg font-semibold text-slate-200" style={getNegativeValueStyle(-totalCosts, { kind: 'currency' })}>
            -{currencyFormatter.format(totalCosts)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Holding period</p>
          <p className="text-lg font-semibold text-slate-100">{holdingMonths} mo</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Net profit</p>
          <p
            className={`text-lg font-semibold ${meta.netProfit >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
            style={getNegativeValueStyle(meta.netProfit, { kind: 'currency' })}
          >
            {currencyFormatter.format(meta.netProfit)}
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">One-time costs</p>
          {costItems.map((item) => (
            <div key={item.key} className="grid grid-cols-[1fr_auto] gap-2 text-sm">
              <p className="text-slate-100">{item.label}</p>
              <p className="text-right text-slate-200" style={getNegativeValueStyle(-item.total, { kind: 'currency' })}>
                -{currencyFormatter.format(item.total)}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Holding costs ({holdingMonths} mo)</p>
          {holdingItems.map((item) => (
            <div key={item.key} className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm">
              <p className="text-slate-100">{item.label}</p>
              <p className="text-right text-muted">{currencyFormatter.format(item.monthly)}/mo</p>
              <p className="text-right text-slate-200" style={getNegativeValueStyle(-item.total, { kind: 'currency' })}>
                -{currencyFormatter.format(item.total)}
              </p>
            </div>
          ))}
          <div className="mt-1 grid grid-cols-[1fr_auto_auto] gap-2 border-t border-white/10 pt-2 text-sm">
            <p className="text-slate-100">Holding costs total</p>
            <p className="text-right text-muted">{currencyFormatter.format(meta.holdingCostsTotal / holdingMonths)}/mo</p>
            <p
              className="text-right font-semibold text-slate-200"
              style={getNegativeValueStyle(-meta.holdingCostsTotal, { kind: 'currency' })}
            >
              -{currencyFormatter.format(meta.holdingCostsTotal)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Net profit formula</p>
        <p className="mt-1 text-sm text-slate-200">
          {currencyFormatter.format(meta.salePrice)} - {currencyFormatter.format(totalCosts)} ={' '}
          <span
            className={`font-semibold ${meta.netProfit >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
            style={getNegativeValueStyle(meta.netProfit, { kind: 'currency' })}
          >
            {currencyFormatter.format(meta.netProfit)}
          </span>
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
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl panel-surface p-5 shadow-soft">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-accent">Show your work</p>
            <h3 className="text-xl font-semibold">{strategyLabels[activeStrategy]} calculations</h3>
            <p className="text-sm text-muted">Line-item math behind each strategy&apos;s outcome, including dedicated BRRRR capital and flip profit breakdowns.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-muted transition hover:bg-white/10">
            Close
          </button>
        </div>

        {!breakdown ? (
          <p className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm text-muted">No breakdown available for this strategy yet.</p>
        ) : (
          <div className="space-y-3">
            {activeStrategy === 'brrrr' && breakdown.brrrrMeta ? (
              <BrrrrFinancials breakdown={breakdown} output={output} />
            ) : activeStrategy === 'flip' && breakdown.flipMeta ? (
              <FlipFinancials breakdown={breakdown} />
            ) : (
              <div className="space-y-2">
                <div className="hidden grid-cols-[1.2fr_1fr_1fr] gap-2 px-3 text-[11px] uppercase tracking-wide text-muted sm:grid">
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

