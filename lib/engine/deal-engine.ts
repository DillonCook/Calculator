import { normalizeDealInput, type DealInputModel, type DealResult } from '@/lib/models/deal';
import {
  calculateAirbnbStrategy,
  calculateBrrrrStrategy,
  calculateFlipStrategy,
  calculateLongTermStrategy,
  calculatePadSplitStrategy,
  calculatePurchaseStrategy
} from '@/lib/engine/strategy-modules';

export const calculateDeal = (input: DealInputModel): DealResult => {
  const normalizedInput = normalizeDealInput(input);

  const purchase = calculatePurchaseStrategy(normalizedInput);
  const longTerm = calculateLongTermStrategy(normalizedInput, purchase.totalCashNeeded);
  const airbnb = calculateAirbnbStrategy(normalizedInput, purchase.totalCashNeeded);
  const padSplit = calculatePadSplitStrategy(normalizedInput, purchase.totalCashNeeded);
  const brrrr = calculateBrrrrStrategy(normalizedInput, purchase.totalCashNeeded, longTerm.noiMonthly ?? 0);
  const flip = calculateFlipStrategy(normalizedInput, purchase.totalCashNeeded);

  const strategyCashFlows = [
    longTerm.monthlyCashFlow,
    airbnb.monthlyCashFlow,
    padSplit.monthlyCashFlow,
    brrrr.monthlyCashFlow,
    flip.monthlyCashFlow
  ];
  const bestMonthlyCashFlow = Math.max(...strategyCashFlows);

  const summary = {
    cashToClose: purchase.totalCashNeeded,
    monthlyCashFlow: bestMonthlyCashFlow,
    cashOnCashReturn: Math.max(
      longTerm.cashOnCashReturn,
      airbnb.cashOnCashReturn,
      padSplit.cashOnCashReturn,
      brrrr.cashOnCashReturn,
      flip.cashOnCashReturn
    ),
    roi: Math.max(longTerm.roi, airbnb.roi, padSplit.roi, brrrr.roi, flip.roi),
    irr: Math.max(longTerm.irr, airbnb.irr, padSplit.irr, brrrr.irr, flip.irr)
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
