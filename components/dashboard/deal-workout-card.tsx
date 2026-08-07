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

const formatAdjustmentPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

const scenarioActionLabel = (scenario: DealWorkoutScenario) => {
  const { purchasePrice, downPaymentPercent } = scenario.adjustments;

  if (typeof purchasePrice === 'number' && typeof downPaymentPercent === 'number') {
    return `Use ${currencyFormatter.format(purchasePrice)} + ${formatAdjustmentPercent(downPaymentPercent)} down`;
  }
  if (typeof downPaymentPercent === 'number') {
    return `Use ${formatAdjustmentPercent(downPaymentPercent)} down`;
  }
  if (typeof purchasePrice === 'number') {
    return `Use ${currencyFormatter.format(purchasePrice)} price`;
  }
  return 'Apply this fix';
};

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
      ? 'Set a target IRR in Build to calculate the needed purchase price cut.'
      : targetIrrPriceCutAmount > 0
        ? `Cut purchase price by ${currencyFormatter.format(targetIrrPriceCutAmount)} to target ${targetIrrLabel}% IRR.`
        : `Target IRR is set to ${targetIrrLabel}% in Build.`;

  return (
    <section className="deal-workout-surface results-hero-support section-shell-analysis">
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="dashboard-kicker">Make the deal work</p>
        {strategy === 'flip' ? (
          <div className="dashboard-meta text-right text-[11px]">
            <p>Net profit: {currencyFormatter.format(recommendation.currentNetProfit)}</p>
          </div>
        ) : null}
      </div>

      {recommendation.canWorkAlready ? (
        <p className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1.5 text-xs leading-snug text-emerald-200 sm:text-sm">
          This strategy already works on current terms. No forced edits needed.
        </p>
      ) : null}

      {recommendation.constrainedByOperations ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-xs leading-snug text-amber-100 sm:text-sm">
          {strategy === 'flip'
            ? 'This flip cannot be solved through financing tweaks. Improve resale value, reduce rehab/sell costs, or shorten hold costs to recover net profit.'
            : 'Debt terms are not the blocker. Operating income is negative even with no debt, so you would need higher income or lower non-debt expenses.'}
        </p>
      ) : null}

      {!recommendation.canWorkAlready && !recommendation.constrainedByOperations ? (
        <div className="grid gap-1">
          {scenariosToRender.map((scenario) => {
            const isCashPriceCutScenario = isCashDeal && shouldShowInlinePriceCut && scenario.key === 'price-cut';
            const isLoanDualFixLayout = shouldShowInlinePriceCut && scenario.key === 'down-payment' && Boolean(dualFixScenarios.priceCut);

            return (
              <article
                key={scenario.key}
                className={isLoanDualFixLayout ? '' : 'dashboard-block rounded-lg p-2.5'}
              >
                {!isLoanDualFixLayout ? <p className="text-sm font-medium leading-tight">{scenario.title}</p> : null}

                {isLoanDualFixLayout ? (
                  <div className="grid gap-4 sm:grid-cols-2 sm:items-center sm:gap-6">
                    <div className="deal-workout-action flex flex-col items-center justify-center gap-2 text-center">
                      <p className="text-xs font-semibold leading-tight text-slate-100">{scenario.title}</p>
                      <button
                        type="button"
                        className="btn-primary btn-work tap-feedback min-h-8 w-full rounded-lg px-2.5 py-1 text-xs font-medium sm:w-36"
                        onClick={() => onApply(scenario)}
                      >
                        {scenarioActionLabel(scenario)}
                      </button>
                    </div>
                    <div className="deal-workout-action flex flex-col items-center justify-center gap-2 text-center">
                      <p className="text-xs font-semibold leading-tight text-slate-100">Reduce Purchase Price</p>
                      <button
                        type="button"
                        className="btn-primary btn-work tap-feedback min-h-8 w-full rounded-lg px-2.5 py-1 text-xs font-medium sm:w-36"
                        onClick={() => dualFixScenarios.priceCut && onApply(dualFixScenarios.priceCut)}
                      >
                        {dualFixScenarios.priceCut ? scenarioActionLabel(dualFixScenarios.priceCut) : 'Apply this fix'}
                      </button>
                    </div>
                  </div>
                ) : isCashPriceCutScenario ? (
                  <div className="mt-1.5 grid gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="section-tag section-tag-analysis">
                        Target IRR {targetIrrLabel}%
                      </span>
                      <button
                        type="button"
                        className="btn-primary btn-work tap-feedback min-h-8 rounded-lg px-3 py-1 text-xs font-medium"
                        onClick={applyTargetIrrPriceFix}
                        disabled={targetIrrDecimal === null}
                      >
                        Apply this fix
                      </button>
                    </div>
                    <p className="text-[11px] leading-tight text-muted">{priceCutSubtext}</p>
                  </div>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary btn-work tap-feedback min-h-8 rounded-lg px-2.5 py-1 text-xs font-medium"
                      onClick={() => onApply(scenario)}
                    >
                      {scenarioActionLabel(scenario)}
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
