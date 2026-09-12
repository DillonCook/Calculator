import { resolveStrategyValue } from '@/lib/strategy-value';
import type { DealInputModel, StrategyKey } from '@/lib/models/deal';

export function getDealReadiness(model: DealInputModel, activeStrategy: StrategyKey) {
    const coreMissing: string[] = [];
    const strategyMissing: string[] = [];
    const hasDealName = model.purchase.dealName.trim().length > 0;
    if (!hasDealName) coreMissing.push('deal name');

    if (model.purchase.ownershipMode === 'purchase') {
      if (model.purchase.purchasePrice <= 0) coreMissing.push('purchase price');
      if (model.purchase.financingType === 'loan' && (!Number.isFinite(model.purchase.downPaymentPercent) || model.purchase.downPaymentPercent < 0 || model.purchase.downPaymentPercent > 1)) coreMissing.push('down payment');
      if (model.purchase.financingType === 'loan' && (!Number.isFinite(model.purchase.interestRate) || model.purchase.interestRate < 0)) coreMissing.push('interest rate');
    }

    if (activeStrategy === 'purchase') {
      if (model.commercial.grossLeasableAreaSqft <= 0) strategyMissing.push('gross leasable area');
      if (model.commercial.occupiedSqft <= 0) strategyMissing.push('leased area');
      if (model.commercial.averageBaseRentPerSqftYear <= 0) strategyMissing.push('base rent');
    }

    if (activeStrategy === 'longTerm' && model.longTerm.grossRentMonthly <= 0 && !(model.longTerm.annualRevenueOverride && model.longTerm.annualRevenueOverride > 0)) {
      strategyMissing.push('gross rent');
    }

    if (activeStrategy === 'airbnb' && model.airbnb.adr <= 0 && !(model.airbnb.annualRevenueOverride && model.airbnb.annualRevenueOverride > 0)) {
      strategyMissing.push('ADR');
    }

    if (activeStrategy === 'padSplit' && !(model.padSplit.annualRevenueOverride && model.padSplit.annualRevenueOverride > 0)) {
      if (model.padSplit.rentableRooms <= 0) strategyMissing.push('rentable rooms');
      if (model.padSplit.avgWeeklyRatePerRoom <= 0) strategyMissing.push('weekly rate');
    }

    if ((activeStrategy === 'brrrr' || activeStrategy === 'flip') && !resolveStrategyValue(model, activeStrategy)) {
      strategyMissing.push('ARV');
    }

    const missing = [...coreMissing, ...strategyMissing];
    return {
      ready: missing.length === 0,
      missing,
      sections: {
        core: coreMissing,
        strategy: strategyMissing
      }
    };
}
