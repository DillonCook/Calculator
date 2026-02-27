import {
  calculateRemainingBalance,
  calcTotalRoiFromTimeline,
  calculateIrr
} from '@/lib/engine/investment-math';
import type { DealInputModel, ExpenseStrategyKey, StrategyCalculationLineItem, StrategyOutput } from '@/lib/models/deal';
import { calculateAcquisitionDebtService, calculateCashToClose, calculateInterestOnlyPayment, calculateLoanAmount, calculateMonthlyPayment } from '@/lib/engine/finance';

const createBaseOutput = (strategy: StrategyOutput['strategy'], notes: string): StrategyOutput => ({
  strategy,
  monthlyCashFlow: 0,
  annualCashFlow: 0,
  capRate: 0,
  cashOnCashReturn: 0,
  dscr: 0,
  roi: 0,
  irr: 0,
  totalCashNeeded: 0,
  notes,
  noiMonthly: 0,
  saleProceeds: 0,
  cashFlowTimeline: []
});

interface TimelineDebtInput {
  principal: number;
  annualRate: number;
  termMonths: number;
  amortizationType: 'PI' | 'IO';
  monthlyPaymentOverride?: number;
  terminalBalanceOverride?: number;
}

interface LeveredTimelineInput {
  input: DealInputModel;
  totalCashNeeded: number;
  annualRevenueYear1: number;
  annualOperatingExpensesYear1: number;
  arv: number;
  revenueGrowthRate: number;
  expenseGrowthRate: number;
  debts: TimelineDebtInput[];
}

const clampPercent = (value: number) => Math.min(Math.max(value, 0), 1);
const clampGrowthRate = (value: number) => Math.min(Math.max(value, -0.95), 1);

const getPurchaseLoanTerms = (input: DealInputModel) => {
  const { purchase } = input;

  return calculateAcquisitionDebtService({
    financingType: purchase.financingType,
    amortizationType: purchase.amortizationType,
    purchasePrice: purchase.purchasePrice,
    downPaymentPercent: purchase.downPaymentPercent,
    interestRate: purchase.interestRate,
    loanTermYears: purchase.loanTermYears,
    helocAmount: purchase.helocAmount,
    helocRate: purchase.helocRate,
    helocTermYears: purchase.helocTermYears,
    helocAmortizationType: purchase.helocAmortizationType,
    existingMortgageMonthly: purchase.ownershipMode === 'owned' ? purchase.existingMortgageMonthly : 0,
    existingMortgageBalance: purchase.ownershipMode === 'owned' ? purchase.existingMortgageBalance : 0,
    existingMortgageRate: purchase.ownershipMode === 'owned' ? purchase.existingMortgageRate : 0,
    existingMortgageRemainingYears: purchase.ownershipMode === 'owned' ? purchase.existingMortgageRemainingYears : 0
  });
};

const getMonthlyFixedCosts = (input: DealInputModel): number => {
  const { purchase } = input;

  if (purchase.ownershipMode === 'owned') {
    return purchase.existingTaxMonthly + purchase.existingInsuranceMonthly + purchase.hoaMonthly + purchase.pmiMonthly;
  }

  const annualTax = purchase.propertyTaxAnnualOverride ?? purchase.purchasePrice * 0.017;
  const annualInsurance = purchase.insuranceAnnualOverride ?? purchase.purchasePrice * 0.01;

  return annualTax / 12 + annualInsurance / 12 + purchase.hoaMonthly + purchase.pmiMonthly;
};

const getVariableExpenseTotal = (input: DealInputModel, strategy: ExpenseStrategyKey): number => {
  return input.variableExpenses.reduce((sum, expense) => {
    return expense.appliesTo[strategy] ? sum + expense.monthlyAmount : sum;
  }, 0);
};

const buildAcquisitionTimelineDebts = (input: DealInputModel): TimelineDebtInput[] => {
  const { purchase } = input;
  const debts: TimelineDebtInput[] = [];

  if (purchase.ownershipMode === 'owned') {
    const existingPrincipal = Math.max(purchase.existingMortgageBalance, 0);

    if (existingPrincipal > 0) {
      debts.push({
        principal: existingPrincipal,
        annualRate: Math.max(purchase.existingMortgageRate, 0),
        termMonths: Math.max(purchase.existingMortgageRemainingYears, 1) * 12,
        amortizationType: 'PI'
      });
    } else if (purchase.existingMortgageMonthly > 0) {
      debts.push({
        principal: 0,
        annualRate: 0,
        termMonths: Math.max(purchase.existingMortgageRemainingYears, 1) * 12,
        amortizationType: 'PI',
        monthlyPaymentOverride: Math.max(purchase.existingMortgageMonthly, 0),
        terminalBalanceOverride: 0
      });
    }
  } else if (purchase.financingType === 'loan') {
    debts.push({
      principal: calculateLoanAmount(purchase.purchasePrice, purchase.downPaymentPercent),
      annualRate: Math.max(purchase.interestRate, 0),
      termMonths: Math.max(purchase.loanTermYears, 1) * 12,
      amortizationType: purchase.amortizationType
    });
  }

  debts.push({
    principal: Math.max(purchase.helocAmount, 0),
    annualRate: Math.max(purchase.helocRate, 0),
    termMonths: Math.max(purchase.helocTermYears, 1) * 12,
    amortizationType: purchase.helocAmortizationType
  });

  return debts.filter(
    (debt) => debt.principal > 0 || (debt.monthlyPaymentOverride ?? 0) > 0 || (debt.terminalBalanceOverride ?? 0) > 0
  );
};

const calculateDscr = (noiMonthly: number, debtServiceMonthly: number): number => {
  if (debtServiceMonthly <= 0) return 0;
  return noiMonthly / debtServiceMonthly;
};

const toAnnual = (monthly: number): number => monthly * 12;

const toLine = (key: string, label: string, monthly: number): StrategyCalculationLineItem => ({
  key,
  label,
  monthly,
  annual: toAnnual(monthly)
});

const getDebtMonthlyPayment = (debt: TimelineDebtInput): number => {
  if (debt.monthlyPaymentOverride !== undefined) return Math.max(debt.monthlyPaymentOverride, 0);
  if (debt.principal <= 0) return 0;
  if (debt.amortizationType === 'IO') return calculateInterestOnlyPayment(debt.principal, debt.annualRate);

  return calculateMonthlyPayment(debt.principal, debt.annualRate, debt.termMonths / 12);
};

const getDebtRemainingBalanceAtHold = (debt: TimelineDebtInput, holdYears: number): number => {
  if (debt.terminalBalanceOverride !== undefined) return Math.max(debt.terminalBalanceOverride, 0);
  if (debt.principal <= 0) return 0;
  if (debt.amortizationType === 'IO') return debt.principal;

  return calculateRemainingBalance(debt.principal, debt.annualRate, debt.termMonths / 12, holdYears, 'PI');
};

const getMonthlyReserveTotal = (input: DealInputModel, strategy: 'longTerm' | 'airbnb' | 'padSplit'): number => {
  if (strategy === 'longTerm') {
    const gross = input.longTerm.grossRentMonthly + input.longTerm.otherIncomeMonthly;
    const effectiveGrossIncome = gross - gross * clampPercent(input.longTerm.vacancyPercent);
    return effectiveGrossIncome * (clampPercent(input.longTerm.maintenancePercent) + clampPercent(input.longTerm.capexPercent));
  }

  if (strategy === 'airbnb') {
    const occupiedNights = input.airbnb.nightsPerMonth * clampPercent(input.airbnb.occupancyPercent);
    const roomRevenue = occupiedNights * input.airbnb.adr;
    const bookings = occupiedNights / Math.max(input.airbnb.averageNightsPerBooking, 1);
    const cleaningRevenue = bookings * input.airbnb.cleaningFeeCharged;
    const gross = roomRevenue + cleaningRevenue;

    return gross * (clampPercent(input.airbnb.maintenancePercent) + clampPercent(input.airbnb.capexPercent));
  }

  const rentableRooms = Number.isFinite(input.padSplit.rentableRooms) ? input.padSplit.rentableRooms : 0;
  const avgWeeklyRatePerRoom = Number.isFinite(input.padSplit.avgWeeklyRatePerRoom) ? input.padSplit.avgWeeklyRatePerRoom : 0;
  const gross =
    rentableRooms *
    avgWeeklyRatePerRoom *
    input.padSplit.weeksPerMonth *
    clampPercent(input.padSplit.occupancyPercent) +
    input.padSplit.otherIncomeMonthly;

  return gross * (clampPercent(input.padSplit.maintenancePercent) + clampPercent(input.padSplit.capexPercent));
};

const resolveStrategyArv = (input: DealInputModel, strategy: 'longTerm' | 'airbnb' | 'padSplit' | 'brrrr' | 'flip'): number => {
  const baseArv = input.purchase.arv;

  if (strategy === 'longTerm') return input.longTerm.arvOverride ?? baseArv;
  if (strategy === 'airbnb') return input.airbnb.arvOverride ?? baseArv;
  if (strategy === 'padSplit') return input.padSplit.arvOverride ?? baseArv;
  if (strategy === 'brrrr') return input.brrrr.arvOverride ?? baseArv;

  return input.flip.arvOverride ?? baseArv;
};

const resolveRehabBudget = (input: DealInputModel, strategy: 'brrrr' | 'flip'): number => {
  if (strategy === 'brrrr') return input.brrrr.rehabOverride ?? input.purchase.rehabBudget;
  return input.flip.rehabOverride ?? input.purchase.rehabBudget;
};

const buildLeveredTimeline = ({
  input,
  totalCashNeeded,
  annualRevenueYear1,
  annualOperatingExpensesYear1,
  arv,
  revenueGrowthRate,
  expenseGrowthRate,
  debts
}: LeveredTimelineInput) => {
  const { purchase, assumptions } = input;
  const holdYears = Math.max(assumptions.holdYears, 0);
  const fullYears = Math.floor(holdYears);
  const partialYear = holdYears - fullYears;
  const revenueGrowth = clampGrowthRate(revenueGrowthRate);
  const expenseGrowth = clampGrowthRate(expenseGrowthRate);
  const annualDebtService = debts.reduce((sum, debt) => sum + getDebtMonthlyPayment(debt) * 12, 0);
  const remainingLoanBalance = debts.reduce((sum, debt) => sum + getDebtRemainingBalanceAtHold(debt, holdYears), 0);

  const baseValue = arv > 0 ? arv : purchase.purchasePrice;
  const terminalPropertyValue = holdYears > 0 ? baseValue * Math.pow(1 + assumptions.annualAppreciationPercent, holdYears) : baseValue;
  const saleProceeds = terminalPropertyValue * (1 - assumptions.sellingCostPercent) - remainingLoanBalance;

  const timeline = [-Math.abs(totalCashNeeded)];

  for (let year = 1; year <= fullYears; year += 1) {
    const revenueForYear = annualRevenueYear1 * Math.pow(1 + revenueGrowth, year - 1);
    const expensesForYear = annualOperatingExpensesYear1 * Math.pow(1 + expenseGrowth, year - 1);
    const annualNoi = revenueForYear - expensesForYear;
    timeline.push(annualNoi - annualDebtService);
  }

  if (partialYear > 0) {
    const partialRevenue = annualRevenueYear1 * Math.pow(1 + revenueGrowth, fullYears) * partialYear;
    const partialExpenses = annualOperatingExpensesYear1 * Math.pow(1 + expenseGrowth, fullYears) * partialYear;
    const partialDebtService = annualDebtService * partialYear;
    timeline.push(partialRevenue - partialExpenses - partialDebtService + saleProceeds);
  } else if (fullYears > 0) {
    timeline[fullYears] += saleProceeds;
  } else {
    timeline.push(saleProceeds);
  }

  return {
    timeline,
    saleProceeds,
    irr: calculateIrr(timeline),
    roi: calcTotalRoiFromTimeline(timeline)
  };
};


export const calculatePurchaseStrategy = (input: DealInputModel): StrategyOutput => {
  const { purchase, commercial } = input;
  const base = createBaseOutput('purchase', 'Retail / strip-plaza underwriting using leased square footage and $/sq ft rent.');

  const { debtService, principal } = getPurchaseLoanTerms(input);
  const fixedCosts = getMonthlyFixedCosts(input);

  const cashToClose =
    purchase.ownershipMode === 'owned'
      ? Math.max(purchase.helocClosingCosts, 0)
      : calculateCashToClose(
          purchase.purchasePrice,
          purchase.rehabBudget,
          purchase.downPaymentPercent,
          purchase.closingCostPercent,
          purchase.pointsPercent,
          purchase.financingType,
          purchase.helocAmount,
          purchase.helocClosingCosts
        );

  const grossLeasableAreaSqft = Math.max(commercial.grossLeasableAreaSqft, 0);
  const occupiedSqft = Math.min(Math.max(commercial.occupiedSqft, 0), grossLeasableAreaSqft);
  const occupancyPercent = clampPercent(commercial.vacancyPercent);
  const creditLossPercent = clampPercent(commercial.creditLossPercent);
  const managementFeePercent = clampPercent(commercial.managementFeePercent);
  const rentAndRecoveryPerSqftYear = Math.max(commercial.averageBaseRentPerSqftYear, 0) + Math.max(commercial.nnnRecoveryPerSqftYear, 0);
  const occupancyBySqft = grossLeasableAreaSqft > 0 ? occupiedSqft / grossLeasableAreaSqft : 0;
  const annualPotentialGross = grossLeasableAreaSqft * rentAndRecoveryPerSqftYear;
  const annualPhysicalVacancyLoss = (grossLeasableAreaSqft - occupiedSqft) * rentAndRecoveryPerSqftYear;
  const annualOccupiedGross = annualPotentialGross - annualPhysicalVacancyLoss;
  const annualEconomicVacancyLoss = annualOccupiedGross * occupancyPercent;
  const annualCreditLoss = annualOccupiedGross * creditLossPercent;
  const annualEffectiveGross = annualOccupiedGross - annualEconomicVacancyLoss - annualCreditLoss;
  const annualManagementFee = annualEffectiveGross * managementFeePercent;
  const annualNonRecoverableExpenses = grossLeasableAreaSqft * Math.max(commercial.nonRecoverableExpensesPerSqftYear, 0);
  const annualTiReserve = grossLeasableAreaSqft * Math.max(commercial.tenantImprovementsReservePerSqftYear, 0);
  const annualLeasingReserve = grossLeasableAreaSqft * Math.max(commercial.leasingCommissionsReservePerSqftYear, 0);
  const annualFixedCosts = fixedCosts * 12;
  const annualOperatingExpenses =
    annualEconomicVacancyLoss +
    annualCreditLoss +
    annualManagementFee +
    annualNonRecoverableExpenses +
    annualTiReserve +
    annualLeasingReserve +
    annualFixedCosts;
  const annualNoi =
    annualOccupiedGross - annualOperatingExpenses;
  const noiMonthly = annualNoi / 12;
  const monthlyCashFlow = noiMonthly - debtService;
  const annualCashFlow = monthlyCashFlow * 12;
  const timelineData = buildLeveredTimeline({
    input,
    totalCashNeeded: cashToClose,
    annualRevenueYear1: annualOccupiedGross,
    annualOperatingExpensesYear1: annualOperatingExpenses,
    arv: purchase.arv,
    revenueGrowthRate: clampGrowthRate(commercial.annualRentGrowthPercent),
    expenseGrowthRate: clampGrowthRate(commercial.annualExpenseGrowthPercent),
    debts: buildAcquisitionTimelineDebts(input)
  });
  const annualDebtService = debtService * 12;
  const denominator = grossLeasableAreaSqft * rentAndRecoveryPerSqftYear * (1 - occupancyPercent - creditLossPercent) * (1 - managementFeePercent);
  const breakEvenOccupancyPercent =
    denominator <= 0 ? 1 : clampPercent((annualNonRecoverableExpenses + annualTiReserve + annualLeasingReserve + annualFixedCosts + annualDebtService) / denominator);
  const debtYield = principal > 0 ? annualNoi / principal : 0;
  const annualBaseRent = occupiedSqft * Math.max(commercial.averageBaseRentPerSqftYear, 0);
  const annualRecoveries = occupiedSqft * Math.max(commercial.nnnRecoveryPerSqftYear, 0);

  return {
    ...base,
    monthlyCashFlow,
    monthlyCashFlowExcludingReserves: monthlyCashFlow + (annualTiReserve + annualLeasingReserve) / 12,
    annualCashFlow,
    totalCashNeeded: cashToClose,
    capRate: purchase.purchasePrice === 0 ? 0 : annualNoi / purchase.purchasePrice,
    cashOnCashReturn: cashToClose === 0 ? 0 : annualCashFlow / cashToClose,
    dscr: calculateDscr(noiMonthly, debtService),
    roi: timelineData.roi,
    irr: timelineData.irr,
    cashFlowTimeline: timelineData.timeline,
    saleProceeds: timelineData.saleProceeds,
    noiMonthly,
    notes: `Leased ${occupiedSqft.toLocaleString()} of ${grossLeasableAreaSqft.toLocaleString()} sq ft (${(occupancyBySqft * 100).toFixed(
      1
    )}% physical occupancy).`,
    calculationBreakdown: {
      lines: [
        toLine('comm-base-rent', 'Base rent ($/sq ft)', annualBaseRent / 12),
        toLine('comm-nnn-recovery', 'NNN reimbursements', annualRecoveries / 12),
        toLine('comm-physical-vacancy', 'Physical vacancy loss (unleased SF)', -(annualPhysicalVacancyLoss / 12)),
        toLine('comm-vacancy', 'Economic vacancy reserve', -(annualEconomicVacancyLoss / 12)),
        toLine('comm-credit-loss', 'Credit loss reserve', -(annualCreditLoss / 12)),
        toLine('comm-management', 'Management fee', -(annualManagementFee / 12)),
        toLine('comm-non-recoverable', 'Non-recoverable OpEx', -(annualNonRecoverableExpenses / 12)),
        toLine('comm-ti', 'Tenant improvement reserve', -(annualTiReserve / 12)),
        toLine('comm-lc', 'Leasing commission reserve', -(annualLeasingReserve / 12)),
        toLine('comm-fixed-costs', 'Fixed costs (tax/ins/hoa/pmi)', -fixedCosts),
        toLine('comm-noi', 'NOI', noiMonthly),
        toLine('comm-debt-service', 'Debt service', -debtService),
        toLine('comm-cash-flow', 'Cash flow', monthlyCashFlow)
      ],
      revenueMonthly: annualOccupiedGross / 12,
      sellerPaidExpensesMonthly: annualOperatingExpenses / 12,
      debtServiceMonthly: debtService,
      noiMonthly,
      cashFlowMonthly: monthlyCashFlow
    },
    commercialSummary: {
      grossLeasableAreaSqft,
      occupiedSqft,
      physicalOccupancyPercent: occupancyBySqft,
      averageBaseRentPerSqftYear: Math.max(commercial.averageBaseRentPerSqftYear, 0),
      nnnRecoveryPerSqftYear: Math.max(commercial.nnnRecoveryPerSqftYear, 0),
      annualPotentialGrossIncome: annualPotentialGross,
      annualPhysicalVacancyLoss,
      annualEconomicVacancyLoss,
      annualCreditLoss,
      annualEffectiveGrossIncome: annualEffectiveGross,
      annualOperatingExpenses,
      annualNoi,
      annualDebtService,
      debtYield,
      breakEvenOccupancyPercent
    }
  };
};

export const calculateLongTermStrategy = (input: DealInputModel, purchaseCashNeeded: number): StrategyOutput => {
  const { longTerm, purchase } = input;
  const base = createBaseOutput('longTerm', 'Stabilized buy-and-hold with reserves and fixed expenses.');

  const { debtService } = getPurchaseLoanTerms(input);
  const fixedCosts = getMonthlyFixedCosts(input);
  const strategyVariableCosts = getVariableExpenseTotal(input, 'longTerm');
  const vacancyPercent = clampPercent(longTerm.vacancyPercent);
  const maintenancePercent = clampPercent(longTerm.maintenancePercent);
  const capexPercent = clampPercent(longTerm.capexPercent);
  const managementPercent = clampPercent(longTerm.managementFeePercent);

  const gross = longTerm.grossRentMonthly + longTerm.otherIncomeMonthly;
  const vacancy = gross * vacancyPercent;
  const effectiveGrossIncome = gross - vacancy;
  const maintenance = effectiveGrossIncome * maintenancePercent;
  const capex = effectiveGrossIncome * capexPercent;
  const managementFee = effectiveGrossIncome * managementPercent;
  const noi = effectiveGrossIncome - maintenance - capex - managementFee - longTerm.ownerExpensesMonthly - fixedCosts - strategyVariableCosts;
  const monthly = noi - debtService;
  const annual = monthly * 12;
  const annualRevenueYear1 = gross * 12;
  const annualOperatingExpensesYear1 =
    (vacancy + maintenance + capex + managementFee + longTerm.ownerExpensesMonthly + fixedCosts + strategyVariableCosts) * 12;
  const timelineData = buildLeveredTimeline({
    input,
    totalCashNeeded: purchaseCashNeeded,
    annualRevenueYear1,
    annualOperatingExpensesYear1,
    arv: resolveStrategyArv(input, 'longTerm'),
    revenueGrowthRate: clampGrowthRate(input.assumptions.noiGrowthPercent),
    expenseGrowthRate: clampGrowthRate(input.assumptions.noiGrowthPercent),
    debts: buildAcquisitionTimelineDebts(input)
  });

  return {
    ...base,
    monthlyCashFlow: monthly,
    monthlyCashFlowExcludingReserves: monthly + maintenance + capex,
    annualCashFlow: annual,
    capRate: purchase.purchasePrice === 0 ? 0 : (noi * 12) / purchase.purchasePrice,
    cashOnCashReturn: purchaseCashNeeded === 0 ? 0 : annual / purchaseCashNeeded,
    dscr: calculateDscr(noi, debtService),
    roi: timelineData.roi,
    totalCashNeeded: purchaseCashNeeded,
    noiMonthly: noi,
    irr: timelineData.irr,
    saleProceeds: timelineData.saleProceeds,
    cashFlowTimeline: timelineData.timeline,
    calculationBreakdown: {
      lines: [
        toLine('lt-gross-rent', 'Gross rent', longTerm.grossRentMonthly),
        toLine('lt-other-income', 'Other income', longTerm.otherIncomeMonthly),
        toLine('lt-vacancy', 'Vacancy loss', -vacancy),
        toLine('lt-maintenance', 'Maintenance reserve', -maintenance),
        toLine('lt-capex', 'CapEx reserve', -capex),
        toLine('lt-management', 'Management fee', -managementFee),
        toLine('lt-fixed-costs', 'Fixed costs (tax/ins/hoa/pmi)', -fixedCosts),
        toLine('lt-variable-costs', 'Variable expenses', -strategyVariableCosts),
        toLine('lt-noi', 'NOI', noi),
        toLine('lt-debt-service', 'Debt service', -debtService),
        toLine('lt-cash-flow', 'Cash flow', monthly)
      ],
      revenueMonthly: gross,
      sellerPaidExpensesMonthly: maintenance + capex + managementFee + longTerm.ownerExpensesMonthly + fixedCosts + strategyVariableCosts,
      debtServiceMonthly: debtService,
      noiMonthly: noi,
      cashFlowMonthly: monthly
    }
  };
};

export const calculateAirbnbStrategy = (input: DealInputModel, purchaseCashNeeded: number): StrategyOutput => {
  const { airbnb, purchase } = input;
  const base = createBaseOutput('airbnb', 'Short-term rental model with cleaning and platform drag.');

  const occupiedNights = airbnb.nightsPerMonth * clampPercent(airbnb.occupancyPercent);
  const roomRevenue = occupiedNights * airbnb.adr;
  const bookings = occupiedNights / Math.max(airbnb.averageNightsPerBooking, 1);
  const cleaningRevenue = bookings * airbnb.cleaningFeeCharged;
  const gross = roomRevenue + cleaningRevenue;

  const platformFees = gross * clampPercent(airbnb.platformFeePercent);
  const cleanerCost = bookings * airbnb.cleanerCostPerTurn;
  const maintenance = gross * clampPercent(airbnb.maintenancePercent);
  const capex = gross * clampPercent(airbnb.capexPercent);
  const managementFee = gross * clampPercent(airbnb.managementFeePercent);

  const { debtService } = getPurchaseLoanTerms(input);
  const fixedCosts = getMonthlyFixedCosts(input);
  const strategyVariableCosts = getVariableExpenseTotal(input, 'airbnb');

  const noi = gross - platformFees - cleanerCost - maintenance - capex - managementFee - airbnb.ownerExpensesMonthly - fixedCosts - strategyVariableCosts;
  const monthly = noi - debtService;
  const annual = monthly * 12;
  const investedCapital = purchaseCashNeeded + airbnb.furnishingOneTime;
  const annualRevenueYear1 = gross * 12;
  const annualOperatingExpensesYear1 =
    (platformFees + cleanerCost + maintenance + capex + managementFee + airbnb.ownerExpensesMonthly + fixedCosts + strategyVariableCosts) * 12;
  const timelineData = buildLeveredTimeline({
    input,
    totalCashNeeded: investedCapital,
    annualRevenueYear1,
    annualOperatingExpensesYear1,
    arv: resolveStrategyArv(input, 'airbnb'),
    revenueGrowthRate: clampGrowthRate(input.assumptions.noiGrowthPercent),
    expenseGrowthRate: clampGrowthRate(input.assumptions.noiGrowthPercent),
    debts: buildAcquisitionTimelineDebts(input)
  });

  return {
    ...base,
    monthlyCashFlow: monthly,
    monthlyCashFlowExcludingReserves: monthly + maintenance + capex,
    annualCashFlow: annual,
    capRate: purchase.purchasePrice === 0 ? 0 : (noi * 12) / purchase.purchasePrice,
    cashOnCashReturn: investedCapital === 0 ? 0 : annual / investedCapital,
    dscr: calculateDscr(noi, debtService),
    roi: timelineData.roi,
    totalCashNeeded: investedCapital,
    noiMonthly: noi,
    irr: timelineData.irr,
    saleProceeds: timelineData.saleProceeds,
    cashFlowTimeline: timelineData.timeline,
    calculationBreakdown: {
      lines: [
        toLine('str-room-revenue', 'Room revenue', roomRevenue),
        toLine('str-cleaning-revenue', 'Cleaning revenue', cleaningRevenue),
        toLine('str-platform-fees', 'Platform fees', -platformFees),
        toLine('str-cleaner-cost', 'Cleaner cost', -cleanerCost),
        toLine('str-maintenance', 'Maintenance reserve', -maintenance),
        toLine('str-capex', 'CapEx reserve', -capex),
        toLine('str-management', 'Management fee', -managementFee),
        toLine('str-fixed-costs', 'Fixed costs (tax/ins/hoa/pmi)', -fixedCosts),
        toLine('str-variable-costs', 'Variable expenses', -strategyVariableCosts),
        toLine('str-noi', 'NOI', noi),
        toLine('str-debt-service', 'Debt service', -debtService),
        toLine('str-cash-flow', 'Cash flow', monthly)
      ],
      revenueMonthly: gross,
      sellerPaidExpensesMonthly: platformFees + cleanerCost + maintenance + capex + managementFee + airbnb.ownerExpensesMonthly + fixedCosts + strategyVariableCosts,
      debtServiceMonthly: debtService,
      noiMonthly: noi,
      cashFlowMonthly: monthly
    }
  };
};

export const calculatePadSplitStrategy = (input: DealInputModel, purchaseCashNeeded: number): StrategyOutput => {
  const { padSplit, purchase } = input;
  const base = createBaseOutput('padSplit', 'Rent-by-room economics with platform and turn costs.');

  const legacyPadSplit = padSplit as DealInputModel['padSplit'] & { turnoverCostMonthly?: number };
  const rentableRooms = Number.isFinite(padSplit.rentableRooms) ? padSplit.rentableRooms : 0;
  const avgWeeklyRatePerRoom = Number.isFinite(padSplit.avgWeeklyRatePerRoom) ? padSplit.avgWeeklyRatePerRoom : 0;
  const moveOutsPerYear = Number.isFinite(padSplit.moveOutsPerYear) ? padSplit.moveOutsPerYear : 0;
  const turnoverCostPerMoveOut = Number.isFinite(padSplit.turnoverCostPerMoveOut)
    ? padSplit.turnoverCostPerMoveOut
    : Number.isFinite(legacyPadSplit.turnoverCostMonthly)
      ? legacyPadSplit.turnoverCostMonthly ?? 0
      : 0;

  const gross =
    rentableRooms *
    avgWeeklyRatePerRoom *
    padSplit.weeksPerMonth *
    clampPercent(padSplit.occupancyPercent) +
    padSplit.otherIncomeMonthly;
  const platformFees = gross * clampPercent(padSplit.platformFeePercent);
  const maintenance = gross * clampPercent(padSplit.maintenancePercent);
  const capex = gross * clampPercent(padSplit.capexPercent);
  const managementFee = gross * clampPercent(padSplit.managementFeePercent);
  const turnoverMonthly = (turnoverCostPerMoveOut * moveOutsPerYear * rentableRooms) / 12;
  const placementMonthly = (moveOutsPerYear * ((avgWeeklyRatePerRoom * 10) / 7)) / 12;

  const { debtService } = getPurchaseLoanTerms(input);
  const fixedCosts = getMonthlyFixedCosts(input);
  const strategyVariableCosts = getVariableExpenseTotal(input, 'padSplit');

  const noi =
    gross -
    platformFees -
    maintenance -
    capex -
    managementFee -
    turnoverMonthly -
    placementMonthly -
    padSplit.ownerExpensesMonthly -
    fixedCosts -
    strategyVariableCosts;
  const monthly = noi - debtService;
  const annual = monthly * 12;
  const investedCapital = purchaseCashNeeded + padSplit.furnishingOneTime;
  const annualRevenueYear1 = gross * 12;
  const annualOperatingExpensesYear1 =
    (platformFees +
      maintenance +
      capex +
      managementFee +
      turnoverMonthly +
      placementMonthly +
      padSplit.ownerExpensesMonthly +
      fixedCosts +
      strategyVariableCosts) *
    12;
  const timelineData = buildLeveredTimeline({
    input,
    totalCashNeeded: investedCapital,
    annualRevenueYear1,
    annualOperatingExpensesYear1,
    arv: resolveStrategyArv(input, 'padSplit'),
    revenueGrowthRate: clampGrowthRate(input.assumptions.noiGrowthPercent),
    expenseGrowthRate: clampGrowthRate(input.assumptions.noiGrowthPercent),
    debts: buildAcquisitionTimelineDebts(input)
  });

  return {
    ...base,
    monthlyCashFlow: monthly,
    monthlyCashFlowExcludingReserves: monthly + maintenance + capex,
    annualCashFlow: annual,
    capRate: purchase.purchasePrice === 0 ? 0 : (noi * 12) / purchase.purchasePrice,
    cashOnCashReturn: investedCapital === 0 ? 0 : annual / investedCapital,
    dscr: calculateDscr(noi, debtService),
    roi: timelineData.roi,
    totalCashNeeded: investedCapital,
    noiMonthly: noi,
    irr: timelineData.irr,
    saleProceeds: timelineData.saleProceeds,
    cashFlowTimeline: timelineData.timeline,
    calculationBreakdown: {
      lines: [
        toLine('ps-room-revenue', 'Room revenue', gross - padSplit.otherIncomeMonthly),
        toLine('ps-other-income', 'Other income', padSplit.otherIncomeMonthly),
        toLine('ps-platform-fees', 'Platform fees', -platformFees),
        toLine('ps-turnover-cleaning', 'Turnover / cleaning', -turnoverMonthly),
        toLine('ps-tenant-placement', 'Tenant placement fees', -placementMonthly),
        toLine('ps-maintenance', 'Maintenance reserve', -maintenance),
        toLine('ps-capex', 'CapEx reserve', -capex),
        toLine('ps-management', 'Management fee', -managementFee),
        toLine('ps-fixed-costs', 'Fixed costs (tax/ins/hoa/pmi)', -fixedCosts),
        toLine('ps-variable-costs', 'Variable expenses', -strategyVariableCosts),
        toLine('ps-noi', 'NOI', noi),
        toLine('ps-debt-service', 'Debt service', -debtService),
        toLine('ps-cash-flow', 'Cash flow', monthly)
      ],
      revenueMonthly: gross,
      sellerPaidExpensesMonthly:
        platformFees +
        turnoverMonthly +
        placementMonthly +
        maintenance +
        capex +
        managementFee +
        padSplit.ownerExpensesMonthly +
        fixedCosts +
        strategyVariableCosts,
      debtServiceMonthly: debtService,
      noiMonthly: noi,
      cashFlowMonthly: monthly
    }
  };
};

export const calculateBrrrrStrategy = (
  input: DealInputModel,
  purchaseCashNeeded: number,
  operatingNoiByStrategy: Record<'longTerm' | 'airbnb' | 'padSplit', number>
): StrategyOutput => {
  const { brrrr, purchase } = input;
  const brrrrArv = resolveStrategyArv(input, 'brrrr');
  const selectedOperatingNoi = operatingNoiByStrategy[brrrr.operatingStrategy] ?? operatingNoiByStrategy.longTerm;
  const base = createBaseOutput('brrrr', 'Buy-rehab-refi model blending hold costs and post-refi operation.');

  const strategyVariableCosts = getVariableExpenseTotal(input, brrrr.operatingStrategy);
  const setupCostOneTime = brrrr.operatingStrategy === 'airbnb' ? input.airbnb.furnishingOneTime : brrrr.operatingStrategy === 'padSplit' ? input.padSplit.furnishingOneTime : 0;
  const fixedCosts = getMonthlyFixedCosts(input);
  const acquisitionDebtService = getPurchaseLoanTerms(input).debtService;
  const totalHoldingCosts = brrrr.holdingMonths * (brrrr.holdingExpensesMonthly + fixedCosts + strategyVariableCosts + acquisitionDebtService);
  const investedAtPurchase = purchaseCashNeeded + totalHoldingCosts + setupCostOneTime;
  const refiLoanAmount = (brrrrArv || 0) * brrrr.refinanceLtvPercent;
  const refiClosingCosts = refiLoanAmount * brrrr.refinanceClosingCostPercent;

  const initialLoanAmount = purchase.financingType === 'loan' ? calculateLoanAmount(purchase.purchasePrice, purchase.downPaymentPercent) : 0;

  const cashBackAtRefiNet = refiLoanAmount - refiClosingCosts - initialLoanAmount;
  const investedAfterRefi = investedAtPurchase - cashBackAtRefiNet;

  const refinanceDebt = calculateMonthlyPayment(refiLoanAmount, brrrr.refinanceRate, purchase.loanTermYears);
  const monthly = selectedOperatingNoi - refinanceDebt;
  const annual = monthly * 12;
  const annualNoi = selectedOperatingNoi * 12;
  const timelineData = buildLeveredTimeline({
    input,
    totalCashNeeded: investedAfterRefi,
    annualRevenueYear1: annualNoi,
    annualOperatingExpensesYear1: 0,
    arv: brrrrArv,
    revenueGrowthRate: clampGrowthRate(input.assumptions.noiGrowthPercent),
    expenseGrowthRate: clampGrowthRate(input.assumptions.noiGrowthPercent),
    debts: [
      {
        principal: refiLoanAmount,
        annualRate: brrrr.refinanceRate,
        termMonths: purchase.loanTermYears * 12,
        amortizationType: 'PI'
      }
    ]
  });

  return {
    ...base,
    monthlyCashFlow: monthly,
    monthlyCashFlowExcludingReserves: monthly + getMonthlyReserveTotal(input, brrrr.operatingStrategy),
    annualCashFlow: annual,
    capRate: brrrrArv === 0 ? 0 : (selectedOperatingNoi * 12) / brrrrArv,
    cashOnCashReturn: investedAfterRefi === 0 ? 0 : annual / investedAfterRefi,
    dscr: calculateDscr(selectedOperatingNoi, refinanceDebt),
    roi: timelineData.roi,
    totalCashNeeded: investedAfterRefi,
    noiMonthly: selectedOperatingNoi,
    irr: timelineData.irr,
    saleProceeds: timelineData.saleProceeds,
    cashFlowTimeline: timelineData.timeline,
    calculationBreakdown: {
      lines: [
        toLine('brrrr-selected-noi', 'Selected strategy NOI', selectedOperatingNoi),
        toLine('brrrr-refi-debt-service', 'Refi debt service', -refinanceDebt),
        toLine('brrrr-cash-flow', 'Cash flow', monthly)
      ],
      revenueMonthly: selectedOperatingNoi,
      sellerPaidExpensesMonthly: 0,
      debtServiceMonthly: refinanceDebt,
      noiMonthly: selectedOperatingNoi,
      cashFlowMonthly: monthly
    }
  };
};

export const calculateFlipStrategy = (input: DealInputModel, purchaseCashNeeded: number): StrategyOutput => {
  const { flip, purchase } = input;
  const flipArv = resolveStrategyArv(input, 'flip');
  const flipRehabBudget = resolveRehabBudget(input, 'flip');
  const base = createBaseOutput('flip', 'Renovate-and-resell analysis with one-time net profit at exit and carry costs during hold.');

  const salePrice = flipArv;
  const agentCommission = salePrice * flip.agentCommissionPercent;
  const closingCosts = salePrice * flip.sellClosingCostPercent;
  const strategyVariableCosts = getVariableExpenseTotal(input, 'flip');
  const fixedCosts = getMonthlyFixedCosts(input);
  const debtService = getPurchaseLoanTerms(input).debtService;
  const holdingMonths = Math.max(flip.holdingMonths, 1);

  const buyClosingCosts = purchase.purchasePrice * purchase.closingCostPercent;
  const monthlyHoldingCosts = fixedCosts + strategyVariableCosts + debtService;
  const holdingCosts = monthlyHoldingCosts * holdingMonths;

  const netProfit =
    salePrice -
    purchase.purchasePrice -
    flipRehabBudget -
    buyClosingCosts -
    agentCommission -
    closingCosts -
    flip.sellerConcessions -
    holdingCosts;

  const totalCashInvested = purchaseCashNeeded + holdingCosts;
  const timeline = [-Math.abs(totalCashInvested), totalCashInvested + netProfit];

  return {
    ...base,
    monthlyCashFlow: 0,
    annualCashFlow: 0,
    cashOnCashReturn: totalCashInvested === 0 ? 0 : netProfit / totalCashInvested,
    dscr: 0,
    roi: calcTotalRoiFromTimeline(timeline),
    totalCashNeeded: purchaseCashNeeded + holdingCosts,
    irr: calculateIrr(timeline),
    saleProceeds: netProfit,
    cashFlowTimeline: timeline,
    calculationBreakdown: {
      lines: [
        toLine('flip-sale-price', 'Sale price (projected)', salePrice / holdingMonths),
        toLine('flip-acquisition-cost', 'Purchase price carry', -purchase.purchasePrice / holdingMonths),
        toLine('flip-rehab', 'Rehab', -flipRehabBudget / holdingMonths),
        toLine('flip-buy-closing', 'Buy closing costs', -buyClosingCosts / holdingMonths),
        toLine('flip-agent', 'Agent commission', -agentCommission / holdingMonths),
        toLine('flip-sell-closing', 'Sell closing costs', -closingCosts / holdingMonths),
        toLine('flip-seller-concessions', 'Seller concessions', -flip.sellerConcessions / holdingMonths),
        toLine('flip-fixed-holding', 'Holding: fixed costs', -fixedCosts),
        toLine('flip-variable-holding', 'Holding: variable expenses', -strategyVariableCosts),
        toLine('flip-lender-holding', 'Holding: lender costs', -debtService),
        toLine('flip-holding-total', 'Holding costs total', -monthlyHoldingCosts),
        toLine('flip-net-profit', 'Net profit (one-time)', netProfit / holdingMonths)
      ],
      revenueMonthly: salePrice / holdingMonths,
      sellerPaidExpensesMonthly: (purchase.purchasePrice + flipRehabBudget + buyClosingCosts + agentCommission + closingCosts + flip.sellerConcessions + holdingCosts) / holdingMonths,
      debtServiceMonthly: debtService,
      noiMonthly: 0,
      cashFlowMonthly: 0,
      flipMeta: {
        holdingMonths,
        salePrice,
        purchasePrice: purchase.purchasePrice,
        rehabBudget: flipRehabBudget,
        buyClosingCosts,
        agentCommission,
        sellClosingCosts: closingCosts,
        sellerConcessions: flip.sellerConcessions,
        fixedHoldingCostsMonthly: fixedCosts,
        variableHoldingCostsMonthly: strategyVariableCosts,
        lenderHoldingCostsMonthly: debtService,
        holdingCostsTotal: holdingCosts,
        netProfit
      }
    }
  };
};
