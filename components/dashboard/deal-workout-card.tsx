'use client';

import { currencyFormatter } from '@/lib/formatters';
import { buildDealWorkoutRecommendation, type DealWorkoutScenario } from '@/lib/engine/deal-workout';
import type { DealInputModel, StrategyKey } from '@/lib/models/deal';

interface DealWorkoutCardProps {
  model: DealInputModel;
  strategy: StrategyKey;
  onApply: (scenario: DealWorkoutScenario) => void;
}

export function DealWorkoutCard({ model, strategy, onApply }: DealWorkoutCardProps) {
  const recommendation = buildDealWorkoutRecommendation(model, strategy);
  const shouldShowDualFixActions = ['longTerm', 'airbnb', 'padSplit', 'brrrr'].includes(strategy);
  const priceCutScenario = recommendation.scenarios.find((scenario) => scenario.key === 'price-cut');

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 sm:p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-accent">Make the deal work</p>
          <h3 className="text-base font-semibold">Auto-adjust terms for this strategy</h3>
        </div>
        <div className="text-right text-[11px] text-muted">
          {strategy === 'flip' ? (
            <p>Net proceeds: {currencyFormatter.format(recommendation.currentSaleProceeds)}</p>
          ) : (
            <>
              <p>Cash flow: {currencyFormatter.format(recommendation.currentMonthlyCashFlow)}/mo</p>
              <p>DSCR: {recommendation.currentDscr.toFixed(2)}</p>
            </>
          )}
        </div>
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
          {recommendation.scenarios.map((scenario) => (
            <article key={scenario.key} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-sm font-medium">{scenario.title}</p>
              <p className="mt-1 text-xs text-muted">{scenario.description}</p>

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary min-h-10 rounded-lg px-3 py-1.5 text-xs font-medium"
                  onClick={() => onApply(scenario)}
                >
                  Apply this fix
                </button>
                {shouldShowDualFixActions && scenario.key === 'down-payment' && priceCutScenario ? (
                  <button
                    type="button"
                    className="btn-primary min-h-10 rounded-lg px-3 py-1.5 text-xs font-medium"
                    onClick={() => onApply(priceCutScenario)}
                  >
                    Cut purchase price
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
