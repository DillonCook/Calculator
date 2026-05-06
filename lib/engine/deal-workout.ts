import { calculateDeal } from '@/lib/engine/deal-engine';
import type { DealInputModel, StrategyKey, StrategyOutput } from '@/lib/models/deal';

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
  currentNetProfit: number;
  scenarios: DealWorkoutScenario[];
}

const defaultTargets: ConstraintTargets = {
  minMonthlyCashFlow: 0,
  minDscr: 1
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const roundCurrency = (value: number) => Math.round(value / 100) * 100;
const roundPercent = (value: number) => Math.round(value * 1000) / 1000;
const roundPurchasePrice = (value: number) => Math.max(roundCurrency(value), 100);
const getFlipNetProfit = (output: StrategyOutput) =>
  output.calculationBreakdown?.flipMeta?.netProfit ?? (output.saleProceeds ?? 0) - output.totalCashNeeded;

const meetsTargetIrr = (model: DealInputModel, strategy: StrategyKey, targetIrr: number) => {
  const output = calculateDeal(model)[strategy];
  return output.irr >= targetIrr;
};

const meetsCashFlowBreakEven = (model: DealInputModel, strategy: StrategyKey, minMonthlyCashFlow = 0) => calculateDeal(model)[strategy].monthlyCashFlow >= minMonthlyCashFlow;

const findPurchasePriceForMinCashFlow = (model: DealInputModel, strategy: StrategyKey, minMonthlyCashFlow = 0): number | null => {
  const currentPrice = Math.max(model.purchase.purchasePrice, 1);
  if (meetsCashFlowBreakEven(model, strategy, minMonthlyCashFlow)) return currentPrice;

  const minPrice = 1;
  const canBreakEvenAtMinPrice = meetsCashFlowBreakEven(withPurchaseAdjustments(model, { purchasePrice: minPrice }), strategy, minMonthlyCashFlow);
  if (!canBreakEvenAtMinPrice) return null;

  let low = minPrice;
  let high = currentPrice;
  for (let i = 0; i < 28; i += 1) {
    const mid = (low + high) / 2;
    const canBreakEven = meetsCashFlowBreakEven(withPurchaseAdjustments(model, { purchasePrice: mid }), strategy, minMonthlyCashFlow);
    if (canBreakEven) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return low;
};

const isDealWorkable = (model: DealInputModel, strategy: StrategyKey, targets: ConstraintTargets = defaultTargets) => {
  const output = calculateDeal(model)[strategy];
  if (strategy === 'flip') {
    return getFlipNetProfit(output) >= 0;
  }

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

  if (strategy === 'flip') {
    const currentNetProfit = getFlipNetProfit(current);
    const canWorkAlready = currentNetProfit >= 0;

    if (canWorkAlready) {
      return {
        canWorkAlready: true,
        constrainedByOperations: false,
        currentMonthlyCashFlow: current.monthlyCashFlow,
        currentDscr: current.dscr,
        currentNetProfit,
        scenarios: []
      };
    }

    const minPrice = 1;
    const maxPrice = Math.max(model.purchase.purchasePrice, minPrice);
    const workableAtMinPrice = isDealWorkable(withPurchaseAdjustments(model, { purchasePrice: minPrice }), strategy);

    if (!workableAtMinPrice) {
      return {
        canWorkAlready: false,
        constrainedByOperations: true,
        currentMonthlyCashFlow: current.monthlyCashFlow,
        currentDscr: current.dscr,
        currentNetProfit,
        scenarios: []
      };
    }

    let low = minPrice;
    let high = maxPrice;
    for (let i = 0; i < 28; i += 1) {
      const mid = (low + high) / 2;
      const workable = isDealWorkable(withPurchaseAdjustments(model, { purchasePrice: mid }), strategy);
      if (workable) {
        low = mid;
      } else {
        high = mid;
      }
    }

    const rounded = roundPurchasePrice(low);
    const discount = Math.max(model.purchase.purchasePrice - rounded, 0);

    return {
      canWorkAlready: false,
      constrainedByOperations: false,
      currentMonthlyCashFlow: current.monthlyCashFlow,
      currentDscr: current.dscr,
      currentNetProfit,
      scenarios:
        discount > 0
          ? [
              {
                key: 'price-cut',
                title: 'Lower purchase price',
                description: `Cut purchase price by about $${roundCurrency(discount).toLocaleString()} to get this flip back to break-even net profit.`,
                adjustments: { purchasePrice: rounded }
              }
            ]
          : []
    };
  }

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
      currentNetProfit: current.saleProceeds ?? 0,
      scenarios: []
    };
  }

  const scenarios: DealWorkoutScenario[] = [];

  const minWorkablePriceForAllTargets = findBoundary(
    model,
    strategy,
    (value) => ({ purchasePrice: value }),
    1,
    Math.max(model.purchase.purchasePrice, 1)
  );

  if (model.purchase.financingType === 'loan') {
    const minBreakEvenCashFlowPrice = findPurchasePriceForMinCashFlow(model, strategy, 0);

    if (typeof minBreakEvenCashFlowPrice === 'number' && minBreakEvenCashFlowPrice < model.purchase.purchasePrice) {
      const rounded = roundPurchasePrice(minBreakEvenCashFlowPrice);
      const discount = Math.max(model.purchase.purchasePrice - rounded, 0);
      scenarios.push({
        key: 'price-cut',
        title: 'Renegotiate purchase price',
        description: `Drop purchase price by about $${roundCurrency(discount).toLocaleString()} to break even on monthly cash flow.`,
        adjustments: { purchasePrice: rounded }
      });
    }

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
        const roundedComboPrice = roundPurchasePrice(comboPrice);
        const priceDrop = Math.max(model.purchase.purchasePrice - roundedComboPrice, 0);
        scenarios.push({
          key: 'combo',
          title: 'Split the fix (price + down)',
          description: `Set 40% down and cut price by about $${roundCurrency(priceDrop).toLocaleString()} to make the deal pencil.`,
          adjustments: { purchasePrice: roundedComboPrice, downPaymentPercent: cappedDown }
        });
      }
    }
  }

  if (model.purchase.financingType === 'cash' && typeof minWorkablePriceForAllTargets === 'number' && minWorkablePriceForAllTargets < model.purchase.purchasePrice) {
    const rounded = roundPurchasePrice(minWorkablePriceForAllTargets);
    const discount = Math.max(model.purchase.purchasePrice - rounded, 0);
    scenarios.push({
      key: 'price-cut',
      title: 'Renegotiate purchase price',
      description: `Drop purchase price by about $${roundCurrency(discount).toLocaleString()} to hit breakeven targets.`,
      adjustments: { purchasePrice: rounded }
    });
  }

  return {
    canWorkAlready: false,
    constrainedByOperations: false,
    currentMonthlyCashFlow: current.monthlyCashFlow,
    currentDscr: current.dscr,
    currentNetProfit: current.saleProceeds ?? 0,
    scenarios
  };
}

export function findPurchasePriceForTargetIrr(model: DealInputModel, strategy: StrategyKey, targetIrr: number): number | null {
  if (!Number.isFinite(targetIrr)) return null;

  const currentPrice = Math.max(model.purchase.purchasePrice, 1);
  if (meetsTargetIrr(model, strategy, targetIrr)) {
    return roundPurchasePrice(currentPrice);
  }

  const minPrice = 1;
  const canHitTargetAtMinPrice = meetsTargetIrr(withPurchaseAdjustments(model, { purchasePrice: minPrice }), strategy, targetIrr);
  if (!canHitTargetAtMinPrice) return null;

  let low = minPrice;
  let high = currentPrice;
  for (let i = 0; i < 28; i += 1) {
    const mid = (low + high) / 2;
    const meetsTarget = meetsTargetIrr(withPurchaseAdjustments(model, { purchasePrice: mid }), strategy, targetIrr);
    if (meetsTarget) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return roundPurchasePrice(low);
}
