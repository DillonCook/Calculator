import { calculateDeal } from '@/lib/engine/deal-engine';
import type { DealInputModel, StrategyKey } from '@/lib/models/deal';

interface ConstraintTargets {
  minMonthlyCashFlow: number;
  minDscr: number;
}

interface DealWorkoutTermAdjustments {
  purchasePrice?: number;
  downPaymentPercent?: number;
}

export interface DealWorkoutScenario {
  key: 'price-cut' | 'down-payment' | 'combo';
  title: string;
  description: string;
  adjustments: DealWorkoutTermAdjustments;
}

export interface DealWorkoutRecommendation {
  canWorkAlready: boolean;
  constrainedByOperations: boolean;
  currentMonthlyCashFlow: number;
  currentDscr: number;
  scenarios: DealWorkoutScenario[];
}

const defaultTargets: ConstraintTargets = {
  minMonthlyCashFlow: 0,
  minDscr: 1
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const roundCurrency = (value: number) => Math.round(value / 100) * 100;
const roundPercent = (value: number) => Math.round(value * 1000) / 1000;

const isDealWorkable = (model: DealInputModel, strategy: StrategyKey, targets: ConstraintTargets = defaultTargets) => {
  const output = calculateDeal(model)[strategy];
  const hasNoDebt = model.purchase.financingType === 'cash' || model.purchase.downPaymentPercent >= 0.999;
  const meetsDscr = hasNoDebt ? true : output.dscr >= targets.minDscr;
  return output.monthlyCashFlow >= targets.minMonthlyCashFlow && meetsDscr;
};

const withPurchaseAdjustments = (model: DealInputModel, updates: DealWorkoutTermAdjustments): DealInputModel => ({
  ...model,
  purchase: {
    ...model.purchase,
    purchasePrice: updates.purchasePrice ?? model.purchase.purchasePrice,
    downPaymentPercent: updates.downPaymentPercent ?? model.purchase.downPaymentPercent
  }
});

const findBoundary = (
  model: DealInputModel,
  strategy: StrategyKey,
  selector: (value: number) => DealWorkoutTermAdjustments,
  min: number,
  max: number
): number | null => {
  const workableAtMax = isDealWorkable(withPurchaseAdjustments(model, selector(max)), strategy);
  if (!workableAtMax) return null;

  const workableAtMin = isDealWorkable(withPurchaseAdjustments(model, selector(min)), strategy);
  if (workableAtMin) return min;

  let low = min;
  let high = max;
  for (let i = 0; i < 28; i += 1) {
    const mid = (low + high) / 2;
    const workable = isDealWorkable(withPurchaseAdjustments(model, selector(mid)), strategy);
    if (workable) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return high;
};

export function buildDealWorkoutRecommendation(model: DealInputModel, strategy: StrategyKey): DealWorkoutRecommendation {
  const current = calculateDeal(model)[strategy];

  const canWorkAlready = current.monthlyCashFlow >= 0 && current.dscr >= 1;
  const opNoDebtModel = {
    ...model,
    purchase: {
      ...model.purchase,
      financingType: 'cash',
      downPaymentPercent: 1,
      pointsPercent: 0
    }
  } as DealInputModel;

  const constrainedByOperations = !isDealWorkable(opNoDebtModel, strategy);

  if (canWorkAlready || constrainedByOperations) {
    return {
      canWorkAlready,
      constrainedByOperations,
      currentMonthlyCashFlow: current.monthlyCashFlow,
      currentDscr: current.dscr,
      scenarios: []
    };
  }

  const scenarios: DealWorkoutScenario[] = [];

  const minWorkablePrice = findBoundary(
    model,
    strategy,
    (value) => ({ purchasePrice: value }),
    1,
    Math.max(model.purchase.purchasePrice, 1)
  );

  if (typeof minWorkablePrice === 'number' && minWorkablePrice < model.purchase.purchasePrice) {
    const rounded = roundCurrency(minWorkablePrice);
    const discount = model.purchase.purchasePrice - rounded;
    scenarios.push({
      key: 'price-cut',
      title: 'Renegotiate purchase price',
      description: `Drop purchase price by about $${roundCurrency(discount).toLocaleString()} to hit breakeven targets.`,
      adjustments: { purchasePrice: rounded }
    });
  }

  if (model.purchase.financingType === 'loan') {
    const minWorkableDown = findBoundary(
      model,
      strategy,
      (value) => ({ downPaymentPercent: value }),
      clamp(model.purchase.downPaymentPercent, 0, 1),
      1
    );

    if (typeof minWorkableDown === 'number' && minWorkableDown > model.purchase.downPaymentPercent) {
      const rounded = roundPercent(minWorkableDown);
      scenarios.push({
        key: 'down-payment',
        title: 'Increase money down',
        description: `Raise down payment to ${(rounded * 100).toFixed(1)}% so debt service clears DSCR + cashflow constraints.`,
        adjustments: { downPaymentPercent: rounded }
      });
    }

    if (typeof minWorkableDown === 'number' && minWorkableDown > 0.4) {
      const cappedDown = 0.4;
      const comboPrice = findBoundary(
        withPurchaseAdjustments(model, { downPaymentPercent: cappedDown }),
        strategy,
        (value) => ({ purchasePrice: value }),
        1,
        Math.max(model.purchase.purchasePrice, 1)
      );

      if (typeof comboPrice === 'number' && comboPrice < model.purchase.purchasePrice) {
        const roundedComboPrice = roundCurrency(comboPrice);
        const priceDrop = model.purchase.purchasePrice - roundedComboPrice;
        scenarios.push({
          key: 'combo',
          title: 'Split the fix (price + down)',
          description: `Set 40% down and cut price by about $${roundCurrency(priceDrop).toLocaleString()} to make the deal pencil.`,
          adjustments: { purchasePrice: roundedComboPrice, downPaymentPercent: cappedDown }
        });
      }
    }
  }

  return {
    canWorkAlready: false,
    constrainedByOperations: false,
    currentMonthlyCashFlow: current.monthlyCashFlow,
    currentDscr: current.dscr,
    scenarios
  };
}
