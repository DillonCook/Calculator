import type { DealInputModel, DealResult } from '@/lib/models/deal';
import { calculateCashToClose } from '@/lib/engine/finance';
import {
  calculateAirbnbStrategy,
  calculateBrrrrStrategy,
  calculateFlipStrategy,
  calculateLongTermStrategy,
  calculatePadSplitStrategy,
  calculatePurchaseStrategy
} from '@/lib/engine/strategy-modules';

export const calculateDeal = (input: DealInputModel): DealResult => {
  const purchase = calculatePurchaseStrategy(input);
  const longTerm = calculateLongTermStrategy(input, purchase.totalCashNeeded);
  const airbnb = calculateAirbnbStrategy(input, purchase.totalCashNeeded);
  const padSplit = calculatePadSplitStrategy(input, purchase.totalCashNeeded);
  const brrrr = calculateBrrrrStrategy(input, purchase.totalCashNeeded, {
    longTerm: longTerm.noiMonthly ?? 0,
    airbnb: airbnb.noiMonthly ?? 0,
    padSplit: padSplit.noiMonthly ?? 0
  });
  const flip = calculateFlipStrategy(input, purchase.totalCashNeeded);

  const strategyCashFlows = [
    longTerm.monthlyCashFlow,
    airbnb.monthlyCashFlow,
    padSplit.monthlyCashFlow,
    brrrr.monthlyCashFlow
  ];
  const bestMonthlyCashFlow = Math.max(...strategyCashFlows);

  const cashToClose =
    input.purchase.ownershipMode === 'owned'
      ? Math.max(input.purchase.helocClosingCosts, 0)
      : calculateCashToClose(
          input.purchase.purchasePrice,
          0,
          input.purchase.downPaymentPercent,
          input.purchase.closingCostPercent,
          input.purchase.pointsPercent,
          input.purchase.financingType,
          input.purchase.helocAmount,
          input.purchase.helocClosingCosts
        );

  const summary = {
    cashToClose,
    monthlyCashFlow: bestMonthlyCashFlow,
    cashOnCashReturn: Math.max(longTerm.cashOnCashReturn, airbnb.cashOnCashReturn, padSplit.cashOnCashReturn, brrrr.cashOnCashReturn),
    roi: Math.max(longTerm.roi, airbnb.roi, padSplit.roi, brrrr.roi),
    irr: Math.max(longTerm.irr, airbnb.irr, padSplit.irr, brrrr.irr)
  };

  return {
    purchase,
    longTerm,
    airbnb,
    padSplit,
    brrrr,
    flip,
    masterSummary: summary
  };
};
