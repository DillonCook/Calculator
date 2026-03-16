'use client';

import { useMemo } from 'react';

import { currencyFormatter } from '@/lib/formatters';
import { buildDealWorkoutRecommendation, findPurchasePriceForTargetIrr, type DealWorkoutScenario } from '@/lib/engine/deal-workout';
import type { DealInputModel, StrategyKey } from '@/lib/models/deal';

interface DealWorkoutCardProps {
  model: DealInputModel;
  strategy: StrategyKey;
  targetIrrPercent: number;
  onApply: (scenario: DealWorkoutScenario) => void;
}

export function DealWorkoutCard({ model, strategy, targetIrrPercent, onApply }: DealWorkoutCardProps) {
  const recommendation = buildDealWorkoutRecommendation(model, strategy);
  const shouldShowInlinePriceCut = ['purchase', 'longTerm', 'airbnb', 'padSplit', 'brrrr'].includes(strategy);
  const isCashDeal = model.purchase.financingType === 'cash';

  const dualFixScenarios = {
    downPayment: recommendation.scenarios.find((scenario) => scenario.key === 'down-payment'),
    priceCut: recommendation.scenarios.find((scenario) => scenario.key === 'price-cut')
  };

  const shouldCollapseLoanDuplicates = Boolean(
    shouldShowInlinePriceCut && !isCashDeal && dualFixScenarios.downPayment && dualFixScenarios.priceCut
  );

  const scenariosToRender = shouldCollapseLoanDuplicates
    ? recommendation.scenarios.filter((scenario) => scenario.key !== 'price-cut')
    : recommendation.scenarios;

  const targetIrrDecimal = Number.isFinite(targetIrrPercent) ? Math.max(targetIrrPercent, 0) : null;
  const targetIrrLabel = targetIrrDecimal === null ? '0.00' : (targetIrrDecimal * 100).toFixed(2);

  const targetIrrPriceCutAmount = useMemo(() => {
    if (!isCashDeal || targetIrrDecimal === null) return 0;
    const targetPrice = findPurchasePriceForTargetIrr(model, strategy, targetIrrDecimal);
    if (typeof targetPrice !== 'number') return 0;
    return Math.max(model.purchase.purchasePrice - targetPrice, 0);
  }, [isCashDeal, model, strategy, targetIrrDecimal]);

  const applyTargetIrrPriceFix = () => {
    if (!isCashDeal || targetIrrDecimal === null) return;
    const targetPurchasePrice = findPurchasePriceForTargetIrr(model, strategy, targetIrrDecimal);
    if (typeof targetPurchasePrice !== 'number') return;

    onApply({
      key: 'price-cut',
      title: 'Target IRR purchase price',
      description: `Cut purchase price to target ${targetIrrLabel}% IRR.`,
      adjustments: { purchasePrice: targetPurchasePrice }
    });
  };

  const priceCutSubtext =
    targetIrrDecimal === null
      ? 'Set a target IRR on Inputs to calculate the needed purchase price cut.'
      : targetIrrPriceCutAmount > 0
        ? `Cut purchase price by ${currencyFormatter.format(targetIrrPriceCutAmount)} to target ${targetIrrLabel}% IRR.`
        : `Target IRR is set to ${targetIrrLabel}% from Inputs.`;

  return (
    <section className="deal-workout-surface rounded-2xl border border-white/10 bg-[#17263a]/88 p-3.5 sm:p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-accent">Make the deal work</p>
          <h3 className="text-base font-semibold">Auto-adjust terms for this strategy</h3>
        </div>
        {strategy === 'flip' ? (
          <div className="text-right text-[11px] text-muted">
            <p>Net proceeds: {currencyFormatter.format(recommendation.currentSaleProceeds)}</p>
          </div>
        ) : null}
      </div>

      {recommendation.canWorkAlready ? (
        <p className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
          This strategy already works on current terms. No forced edits needed.
        </p>
      ) : null}

      {recommendation.constrainedByOperations ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
          {strategy === 'flip'
            ? 'This flip cannot be solved through financing tweaks. Improve resale value, reduce rehab/sell costs, or shorten hold costs to recover net proceeds.'
            : 'Debt terms are not the blocker. Operating income is negative even with no debt, so you would need higher income or lower non-debt expenses.'}
        </p>
      ) : null}

      {!recommendation.canWorkAlready && !recommendation.constrainedByOperations ? (
        <div className="grid gap-2">
          {scenariosToRender.map((scenario) => {
            const isCashPriceCutScenario = isCashDeal && shouldShowInlinePriceCut && scenario.key === 'price-cut';
            const isLoanDualFixLayout = shouldShowInlinePriceCut && scenario.key === 'down-payment' && Boolean(dualFixScenarios.priceCut);
            const shouldShowScenarioDescription = !isCashPriceCutScenario && !isLoanDualFixLayout;

            return (
              <article
                key={scenario.key}
                className={isLoanDualFixLayout ? '' : 'rounded-xl border border-white/10 bg-black/20 p-3'}
              >
                {!isLoanDualFixLayout ? <p className="text-sm font-medium">{scenario.title}</p> : null}
                {shouldShowScenarioDescription ? <p className="mt-1 text-xs text-muted">{scenario.description}</p> : null}

                {isLoanDualFixLayout ? (
                  <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
                    <div className="flex min-h-[132px] flex-col items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 text-center">
                      <p className="text-xs font-semibold text-slate-100">{scenario.title}</p>
                      <button
                        type="button"
                        className="btn-primary btn-work tap-feedback min-h-9 w-full rounded-lg px-2.5 py-1 text-xs font-medium sm:w-40"
                        onClick={() => onApply(scenario)}
                      >
                        Apply this fix
                      </button>
                      <p className="text-[11px] leading-tight text-muted">{scenario.description}</p>
                    </div>
                    <div className="flex min-h-[132px] flex-col items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 text-center">
                      <p className="text-xs font-semibold text-slate-100">Reduce Purchase Price</p>
                      <button
                        type="button"
                        className="btn-primary btn-work tap-feedback min-h-9 w-full rounded-lg px-2.5 py-1 text-xs font-medium sm:w-40"
                        onClick={() => dualFixScenarios.priceCut && onApply(dualFixScenarios.priceCut)}
                      >
                        Apply this fix
                      </button>
                      <p className="text-[11px] leading-tight text-muted">{dualFixScenarios.priceCut?.description}</p>
                    </div>
                  </div>
                ) : isCashPriceCutScenario ? (
                  <div className="mt-2 grid gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-accent/35 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
                        Target IRR {targetIrrLabel}%
                      </span>
                      <button
                        type="button"
                        className="btn-primary btn-work tap-feedback min-h-9 rounded-lg px-3 py-1.5 text-xs font-medium"
                        onClick={applyTargetIrrPriceFix}
                        disabled={targetIrrDecimal === null}
                      >
                        Apply this fix
                      </button>
                    </div>
                    <p className="text-[11px] leading-tight text-muted">{priceCutSubtext}</p>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary btn-work tap-feedback min-h-9 rounded-lg px-2.5 py-1 text-xs font-medium"
                      onClick={() => onApply(scenario)}
                    >
                      Apply this fix
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
