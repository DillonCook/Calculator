import {
  calculateRemainingBalance,
  calcTotalRoiFromTimeline,
  calculateIrr
} from '@/lib/engine/investment-math';
import type { DealInputModel, ExpenseStrategyKey, LongTermTurnaroundSummaryOutput, StrategyCalculationLineItem, StrategyOutput } from '@/lib/models/deal';
import { calculateAcquisitionDebtService, calculateCashToClose, calculateInterestOnlyPayment, calculateLoanAmount, calculateMonthlyPayment } from '@/lib/engine/finance';
import { getMonthlyFixedCosts as getPurchaseMonthlyFixedCosts } from '@/lib/tax-insurance';

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
  annualNoiForYear?: (yearIndex: number) => number;
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
  return getPurchaseMonthlyFixedCosts(input.purchase);
};

const getVariableExpenseTotal = (input: DealInputModel, strategy: ExpenseStrategyKey): number => {
  return input.variableExpenses.reduce((sum, expense) => {
    return expense.appliesTo[strategy] ? sum + expense.monthlyAmount : sum;
  }, 0);
};

const getAcquisitionBasisPrice = (input: DealInputModel): number => {
  const { purchase } = input;
  return purchase.ownershipMode === 'owned' ? Math.max(purchase.ownedPurchasePrice, 0) : Math.max(purchase.purchasePrice, 0);
};

const getCurrentCashToClose = (input: DealInputModel): number => {
  const { purchase } = input;

  if (purchase.ownershipMode === 'owned') {
    return Math.max(purchase.helocClosingCosts, 0);
  }

  return calculateCashToClose(
    purchase.purchasePrice,
    purchase.rehabBudget,
    purchase.downPaymentPercent,
    purchase.closingCostPercent,
    purchase.pointsPercent,
    purchase.financingType,
    purchase.helocAmount,
    purchase.helocClosingCosts
  );
};

const getAcquisitionCapitalInvested = (input: DealInputModel): number => {
  const { purchase } = input;

  if (purchase.ownershipMode === 'owned') {
    return (
      Math.max(purchase.ownedMoneyDown, 0) +
      Math.max(purchase.ownedAdditionalInvested, 0) +
      Math.max(purchase.helocClosingCosts, 0)
    );
  }

  return getCurrentCashToClose(input);
};

const getTotalProjectBasis = (input: DealInputModel, additionalCapital = 0): number => {
  const ownedAdditionalCapital =
    input.purchase.ownershipMode === 'owned' ? Math.max(input.purchase.ownedAdditionalInvested, 0) : 0;

  return getAcquisitionBasisPrice(input) + ownedAdditionalCapital + Math.max(additionalCapital, 0);
};

const buildAcquisitionTimelineDebts = (input: DealInputModel): TimelineDebtInput[] => {
  const { purchase } = input;
  const debts: TimelineDebtInput[] = [];

  if (purchase.ownershipMode === 'owned') {
    const existingPrincipal = Math.max(purchase.existingMortgageBalance, 0);
    const existingMonthlyPayment = Math.max(purchase.existingMortgageMonthly, 0);

    if (existingPrincipal > 0 || existingMonthlyPayment > 0) {
      debts.push({
        principal: existingPrincipal,
        annualRate: Math.max(purchase.existingMortgageRate, 0),
        termMonths: Math.max(purchase.existingMortgageRemainingYears, 1) * 12,
        amortizationType: 'PI',
        monthlyPaymentOverride: existingMonthlyPayment,
        ...(existingPrincipal > 0 ? {} : { terminalBalanceOverride: 0 })
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
    const modeledGross = input.longTerm.grossRentMonthly + input.longTerm.otherIncomeMonthly;
    const gross = input.longTerm.annualRevenueOverride && input.longTerm.annualRevenueOverride > 0 ? input.longTerm.annualRevenueOverride / 12 : modeledGross;
    const effectiveGrossIncome = gross - gross * clampPercent(input.longTerm.vacancyPercent);
    return effectiveGrossIncome * (clampPercent(input.longTerm.maintenancePercent) + clampPercent(input.longTerm.capexPercent));
  }

  if (strategy === 'airbnb') {
    if (input.airbnb.annualRevenueOverride && input.airbnb.annualRevenueOverride > 0) {
      return (input.airbnb.annualRevenueOverride / 12) * (clampPercent(input.airbnb.maintenancePercent) + clampPercent(input.airbnb.capexPercent));
    }
    const occupiedNights = Math.max(input.airbnb.nightsPerMonth, 0) * clampPercent(input.airbnb.occupancyPercent);
    const roomRevenue = occupiedNights * Math.max(input.airbnb.adr, 0);
    return roomRevenue * (clampPercent(input.airbnb.maintenancePercent) + clampPercent(input.airbnb.capexPercent));
  }

  const rentableRooms = Math.max(Number.isFinite(input.padSplit.rentableRooms) ? input.padSplit.rentableRooms : 0, 0);
  const avgWeeklyRatePerRoom = Math.max(Number.isFinite(input.padSplit.avgWeeklyRatePerRoom) ? input.padSplit.avgWeeklyRatePerRoom : 0, 0);
  const weeksPerMonth = Math.max(Number.isFinite(input.padSplit.weeksPerMonth) ? input.padSplit.weeksPerMonth : 0, 0);
  const otherIncomeMonthly = Math.max(Number.isFinite(input.padSplit.otherIncomeMonthly) ? input.padSplit.otherIncomeMonthly : 0, 0);
  const modeledGross =
    rentableRooms *
    avgWeeklyRatePerRoom *
    weeksPerMonth *
    clampPercent(input.padSplit.occupancyPercent) +
    otherIncomeMonthly;
  const gross = input.padSplit.annualRevenueOverride && input.padSplit.annualRevenueOverride > 0 ? input.padSplit.annualRevenueOverride / 12 : modeledGross;

  return gross * (clampPercent(input.padSplit.maintenancePercent) + clampPercent(input.padSplit.capexPercent));
};

const resolveStrategyArv = (input: DealInputModel, strategy: 'longTerm' | 'airbnb' | 'padSplit' | 'brrrr' | 'flip'): number => {
  const baseArv = input.purchase.arv;

  if (strategy === 'longTerm') return input.longTerm.arvOverride ?? baseArv;
  if (strategy === 'airbnb') return input.airbnb.arvOverride ?? baseArv;
  if (strategy === 'padSplit') return input.padSplit.arvOverride ?? baseArv;
  if (strategy === 'brrrr') return input.brrrr.arvOverride ?? 0;

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
  annualNoiForYear,
  arv,
  revenueGrowthRate,
  expenseGrowthRate,
  debts
}: LeveredTimelineInput) => {
  const { assumptions } = input;
  const holdYears = Math.max(assumptions.holdYears, 0);
  const fullYears = Math.floor(holdYears);
  const partialYear = holdYears - fullYears;
  const revenueGrowth = clampGrowthRate(revenueGrowthRate);
  const expenseGrowth = clampGrowthRate(expenseGrowthRate);
  const annualDebtService = debts.reduce((sum, debt) => sum + getDebtMonthlyPayment(debt) * 12, 0);
  const remainingLoanBalance = debts.reduce((sum, debt) => sum + getDebtRemainingBalanceAtHold(debt, holdYears), 0);

  const acquisitionBasisPrice = getAcquisitionBasisPrice(input);
  const baseValue = arv > 0 ? arv : acquisitionBasisPrice;
  const terminalPropertyValue = holdYears > 0 ? baseValue * Math.pow(1 + assumptions.annualAppreciationPercent, holdYears) : baseValue;
  const saleProceeds = terminalPropertyValue * (1 - assumptions.sellingCostPercent) - remainingLoanBalance;

  const timeline = [-Math.abs(totalCashNeeded)];
  const getAnnualNoi = (yearIndex: number) => {
    if (annualNoiForYear) return annualNoiForYear(yearIndex);

    const revenueForYear = annualRevenueYear1 * Math.pow(1 + revenueGrowth, yearIndex);
    const expensesForYear = annualOperatingExpensesYear1 * Math.pow(1 + expenseGrowth, yearIndex);
    return revenueForYear - expensesForYear;
  };

  for (let year = 1; year <= fullYears; year += 1) {
    const annualNoi = getAnnualNoi(year - 1);
    timeline.push(annualNoi - annualDebtService);
  }

  if (partialYear > 0) {
    const partialNoi = getAnnualNoi(fullYears) * partialYear;
    const partialDebtService = annualDebtService * partialYear;
    timeline.push(partialNoi - partialDebtService + saleProceeds);
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

const calculateLongTermTurnaroundSummary = (
  input: DealInputModel,
  purchaseCashNeeded: number,
  debtService: number,
  fixedCosts: number,
  strategyVariableCosts: number
): LongTermTurnaroundSummaryOutput | undefined => {
  const turnaround = input.longTerm.turnaround;
  if (!turnaround.enabled) return undefined;

  const vacancyPercent = clampPercent(turnaround.vacancyPercent);
  const maintenancePercent = clampPercent(turnaround.maintenancePercent);
  const capexPercent = clampPercent(turnaround.capexPercent);
  const managementFeePercent = clampPercent(turnaround.managementFeePercent);
  const exitRefiCapRatePercent = Math.max(turnaround.exitRefiCapRatePercent, 0.0001);
  const noiGrowthRate = clampGrowthRate(input.assumptions.noiGrowthPercent);

  const stabilizedGrossIncomeMonthly =
    Math.max(turnaround.stabilizedGrossRentMonthly, 0) +
    Math.max(turnaround.stabilizedOtherIncomeMonthly, 0) +
    Math.max(turnaround.laundryIncomeMonthly, 0) +
    Math.max(turnaround.vendingMiscIncomeMonthly, 0) +
    Math.max(turnaround.garageIncomeMonthly, 0) +
    Math.max(turnaround.parkingIncomeMonthly, 0) +
    Math.max(turnaround.additionalIncomeMonthly, 0);

  const vacancyLossMonthly = stabilizedGrossIncomeMonthly * vacancyPercent;
  const effectiveGrossIncomeMonthly = stabilizedGrossIncomeMonthly - vacancyLossMonthly;
  const managementFeeMonthly = effectiveGrossIncomeMonthly * managementFeePercent;
  const maintenanceMonthly = effectiveGrossIncomeMonthly * maintenancePercent;
  const capexMonthly = effectiveGrossIncomeMonthly * capexPercent;
  const adjustedFixedCostsMonthly = Math.max(fixedCosts + turnaround.annualTaxInsuranceAdjustment / 12, 0);
  const operatingExpensesMonthly =
    maintenanceMonthly +
    capexMonthly +
    managementFeeMonthly +
    Math.max(turnaround.ownerPaidExpensesMonthly, 0) +
    adjustedFixedCostsMonthly +
    strategyVariableCosts;
  const noiMonthly = effectiveGrossIncomeMonthly - operatingExpensesMonthly;
  const cashFlowPreTaxMonthly = noiMonthly - debtService;
  const cashFlowExcludingReservesMonthly = cashFlowPreTaxMonthly + maintenanceMonthly + capexMonthly;
  const annualNoi = noiMonthly * 12;
  const annualCashFlowPreTax = cashFlowPreTaxMonthly * 12;
  const rehabBudgetForStabilization = Math.max(turnaround.rehabBudgetForStabilization, 0);
  const totalCashInvested = purchaseCashNeeded + rehabBudgetForStabilization;
  const acquisitionBasisPrice = getAcquisitionBasisPrice(input);
  const capRate = acquisitionBasisPrice <= 0 ? 0 : annualNoi / acquisitionBasisPrice;
  const cashOnCashReturn = totalCashInvested === 0 ? 0 : annualCashFlowPreTax / totalCashInvested;
  const impliedValueAtExitCap = annualNoi / exitRefiCapRatePercent;
  const totalProjectBasis = getTotalProjectBasis(input, rehabBudgetForStabilization);
  const capOnCost = totalProjectBasis <= 0 ? 0 : annualNoi / totalProjectBasis;
  const equityCreated = impliedValueAtExitCap - totalProjectBasis;
  const currentGrossIncomeMonthly =
    input.longTerm.annualRevenueOverride && input.longTerm.annualRevenueOverride > 0
      ? input.longTerm.annualRevenueOverride / 12
      : Math.max(input.longTerm.grossRentMonthly, 0) + Math.max(input.longTerm.otherIncomeMonthly, 0);
  const currentVacancyMonthly = currentGrossIncomeMonthly * clampPercent(input.longTerm.vacancyPercent);
  const currentEffectiveGrossIncomeMonthly = currentGrossIncomeMonthly - currentVacancyMonthly;
  const currentMaintenanceMonthly = currentEffectiveGrossIncomeMonthly * clampPercent(input.longTerm.maintenancePercent);
  const currentCapexMonthly = currentEffectiveGrossIncomeMonthly * clampPercent(input.longTerm.capexPercent);
  const currentManagementMonthly = currentEffectiveGrossIncomeMonthly * clampPercent(input.longTerm.managementFeePercent);
  const currentOperatingExpensesMonthly =
    currentVacancyMonthly +
    currentMaintenanceMonthly +
    currentCapexMonthly +
    currentManagementMonthly +
    Math.max(input.longTerm.ownerExpensesMonthly, 0) +
    fixedCosts +
    strategyVariableCosts;
  const turnaroundYearNoi = currentGrossIncomeMonthly * 12 - currentOperatingExpensesMonthly * 12;
  const turnaroundYearCashFlowPreTax = turnaroundYearNoi - debtService * 12;

  const timelineArv =
    input.longTerm.arvOverride && input.longTerm.arvOverride > 0
      ? input.longTerm.arvOverride
      : impliedValueAtExitCap > 0
        ? impliedValueAtExitCap
        : input.purchase.arv;
  const timelineData = buildLeveredTimeline({
    input,
    totalCashNeeded: totalCashInvested,
    annualRevenueYear1: currentGrossIncomeMonthly * 12,
    annualOperatingExpensesYear1: currentOperatingExpensesMonthly * 12,
    annualNoiForYear: (yearIndex) => {
      if (yearIndex <= 0) return turnaroundYearNoi;
      return annualNoi * Math.pow(1 + noiGrowthRate, yearIndex - 1);
    },
    arv: timelineArv,
    revenueGrowthRate: noiGrowthRate,
    expenseGrowthRate: noiGrowthRate,
    debts: buildAcquisitionTimelineDebts(input)
  });

  return {
    enabled: true,
    stabilizedGrossMonthlyRent: Math.max(turnaround.stabilizedGrossRentMonthly, 0),
    stabilizedOtherIncomeMonthly: Math.max(turnaround.stabilizedOtherIncomeMonthly, 0),
    laundryIncomeMonthly: Math.max(turnaround.laundryIncomeMonthly, 0),
    vendingMiscIncomeMonthly: Math.max(turnaround.vendingMiscIncomeMonthly, 0),
    garageIncomeMonthly: Math.max(turnaround.garageIncomeMonthly, 0),
    parkingIncomeMonthly: Math.max(turnaround.parkingIncomeMonthly, 0),
    additionalIncomeMonthly: Math.max(turnaround.additionalIncomeMonthly, 0),
    stabilizedGrossIncomeMonthly,
    effectiveGrossIncomeMonthly,
    rehabBudgetForStabilization,
    annualTaxInsuranceAdjustment: turnaround.annualTaxInsuranceAdjustment,
    vacancyPercent,
    maintenancePercent,
    capexPercent,
    ownerPaidExpensesMonthly: Math.max(turnaround.ownerPaidExpensesMonthly, 0),
    managementFeePercent,
    exitRefiCapRatePercent,
    operatingExpensesMonthly,
    noiMonthly,
    debtServiceMonthly: debtService,
    cashFlowPreTaxMonthly,
    cashFlowExcludingReservesMonthly,
    annualNoi,
    annualCashFlowPreTax,
    totalCashInvested,
    turnaroundYearNoi,
    turnaroundYearCashFlowPreTax,
    dscr: calculateDscr(noiMonthly, debtService),
    capRate,
    cashOnCashReturn,
    irr: timelineData.irr,
    roi: timelineData.roi,
    saleProceeds: timelineData.saleProceeds,
    cashFlowTimeline: timelineData.timeline,
    impliedValueAtExitCap,
    capOnCost,
    equityCreated
  };
};


export const calculatePurchaseStrategy = (input: DealInputModel): StrategyOutput => {
  const { purchase, commercial } = input;
  const base = createBaseOutput('purchase', 'Retail / strip-plaza underwriting using leased square footage and $/sq ft rent.');

  const { debtService, principal } = getPurchaseLoanTerms(input);
  const fixedCosts = getMonthlyFixedCosts(input);
  const strategyVariableCosts = getVariableExpenseTotal(input, 'purchase');
  const capitalInvested = getAcquisitionCapitalInvested(input);
  const acquisitionBasisPrice = getAcquisitionBasisPrice(input);

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
  const annualVariableExpenses = strategyVariableCosts * 12;
  const annualHardOperatingExpenses =
    annualNonRecoverableExpenses +
    annualTiReserve +
    annualLeasingReserve +
    annualVariableExpenses +
    annualFixedCosts;
  const annualOperatingExpenses =
    annualEconomicVacancyLoss +
    annualCreditLoss +
    annualManagementFee +
    annualHardOperatingExpenses;
  const annualNoi =
    annualOccupiedGross - annualOperatingExpenses;
  const noiMonthly = annualNoi / 12;
  const monthlyCashFlow = noiMonthly - debtService;
  const annualCashFlow = monthlyCashFlow * 12;
  const timelineData = buildLeveredTimeline({
    input,
    totalCashNeeded: capitalInvested,
    annualRevenueYear1: annualOccupiedGross,
    annualOperatingExpensesYear1: annualOperatingExpenses,
    annualNoiForYear: (yearIndex) => {
      const rentMultiplier = Math.pow(1 + clampGrowthRate(commercial.annualRentGrowthPercent), yearIndex);
      const expenseMultiplier = Math.pow(1 + clampGrowthRate(commercial.annualExpenseGrowthPercent), yearIndex);
      const occupiedGross = annualOccupiedGross * rentMultiplier;
      const economicVacancyLoss = occupiedGross * occupancyPercent;
      const creditLoss = occupiedGross * creditLossPercent;
      const effectiveGross = occupiedGross - economicVacancyLoss - creditLoss;
      const managementFee = effectiveGross * managementFeePercent;
      const hardOperatingExpenses = annualHardOperatingExpenses * expenseMultiplier;

      return occupiedGross - economicVacancyLoss - creditLoss - managementFee - hardOperatingExpenses;
    },
    arv: purchase.arv,
    revenueGrowthRate: clampGrowthRate(commercial.annualRentGrowthPercent),
    expenseGrowthRate: clampGrowthRate(commercial.annualExpenseGrowthPercent),
    debts: buildAcquisitionTimelineDebts(input)
  });
  const annualDebtService = debtService * 12;
  const denominator = grossLeasableAreaSqft * rentAndRecoveryPerSqftYear * (1 - occupancyPercent - creditLossPercent) * (1 - managementFeePercent);
  const breakEvenOccupancyPercent =
    denominator <= 0 ? 1 : clampPercent((annualHardOperatingExpenses + annualDebtService) / denominator);
  const debtYield = principal > 0 ? annualNoi / principal : 0;
  const annualBaseRent = grossLeasableAreaSqft * Math.max(commercial.averageBaseRentPerSqftYear, 0);
  const annualRecoveries = grossLeasableAreaSqft * Math.max(commercial.nnnRecoveryPerSqftYear, 0);

  return {
    ...base,
    monthlyCashFlow,
    monthlyCashFlowExcludingReserves: monthlyCashFlow + (annualTiReserve + annualLeasingReserve) / 12,
    annualCashFlow,
    totalCashNeeded: capitalInvested,
    capRate: acquisitionBasisPrice <= 0 ? 0 : annualNoi / acquisitionBasisPrice,
    cashOnCashReturn: capitalInvested === 0 ? 0 : annualCashFlow / capitalInvested,
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
        toLine('comm-variable-expenses', 'Variable expenses', -strategyVariableCosts),
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
  const tenantPlacementFeePercent = clampPercent(longTerm.tenantPlacementFeePercent);
  const annualRevenueOverrideMonthly = longTerm.annualRevenueOverride && longTerm.annualRevenueOverride > 0 ? longTerm.annualRevenueOverride / 12 : null;
  const grossRentMonthly = Math.max(longTerm.grossRentMonthly, 0);
  const otherIncomeMonthly = Math.max(longTerm.otherIncomeMonthly, 0);
  const ownerExpensesMonthly = Math.max(longTerm.ownerExpensesMonthly, 0);
  const tenantPlacementRentBase = annualRevenueOverrideMonthly ?? grossRentMonthly;
  const tenantPlacementFeeOneTime =
    purchase.ownershipMode === 'purchase' ? tenantPlacementRentBase * tenantPlacementFeePercent : 0;

  const modeledGross = grossRentMonthly + otherIncomeMonthly;
  const gross = annualRevenueOverrideMonthly ?? modeledGross;
  const vacancy = gross * vacancyPercent;
  const effectiveGrossIncome = gross - vacancy;
  const maintenance = effectiveGrossIncome * maintenancePercent;
  const capex = effectiveGrossIncome * capexPercent;
  const managementFee = effectiveGrossIncome * managementPercent;
  const noi = effectiveGrossIncome - maintenance - capex - managementFee - ownerExpensesMonthly - fixedCosts - strategyVariableCosts;
  const monthly = noi - debtService;
  const annual = monthly * 12;
  const annualRevenueYear1 = gross * 12;
  const annualOperatingExpensesYear1 =
    (vacancy + maintenance + capex + managementFee + ownerExpensesMonthly + fixedCosts + strategyVariableCosts) * 12;
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
  const acquisitionBasisPrice = getAcquisitionBasisPrice(input);
  const turnaroundSummary = calculateLongTermTurnaroundSummary(input, purchaseCashNeeded, debtService, fixedCosts, strategyVariableCosts);
  const stabilizedIncomeSourcesMonthly =
    (turnaroundSummary?.laundryIncomeMonthly ?? 0) +
    (turnaroundSummary?.vendingMiscIncomeMonthly ?? 0) +
    (turnaroundSummary?.garageIncomeMonthly ?? 0) +
    (turnaroundSummary?.parkingIncomeMonthly ?? 0) +
    (turnaroundSummary?.additionalIncomeMonthly ?? 0) +
    (turnaroundSummary?.stabilizedOtherIncomeMonthly ?? 0);
  const stabilizedVacancyMonthly =
    turnaroundSummary ? turnaroundSummary.stabilizedGrossIncomeMonthly * turnaroundSummary.vacancyPercent : 0;
  const stabilizedManagementMonthly =
    turnaroundSummary ? turnaroundSummary.effectiveGrossIncomeMonthly * turnaroundSummary.managementFeePercent : 0;
  const stabilizedMaintenanceMonthly =
    turnaroundSummary ? turnaroundSummary.effectiveGrossIncomeMonthly * turnaroundSummary.maintenancePercent : 0;
  const stabilizedCapexMonthly =
    turnaroundSummary ? turnaroundSummary.effectiveGrossIncomeMonthly * turnaroundSummary.capexPercent : 0;
  const stabilizedFixedAndTaxMonthly =
    turnaroundSummary ? Math.max(fixedCosts + turnaroundSummary.annualTaxInsuranceAdjustment / 12, 0) : 0;
  const longTermRevenueLines =
    annualRevenueOverrideMonthly
      ? [toLine('lt-annual-revenue-override', 'Annual revenue override (monthly equivalent)', gross)]
      : [toLine('lt-gross-rent', 'Gross rent', grossRentMonthly), toLine('lt-other-income', 'Other income', otherIncomeMonthly)];

  const turnaroundLines = turnaroundSummary
    ? [
        toLine('lt-stab-gross-rent', 'Stabilized gross rent', turnaroundSummary.stabilizedGrossMonthlyRent),
        toLine('lt-stab-income-sources', 'Stabilized income sources (laundry/vending/garage/parking/other)', stabilizedIncomeSourcesMonthly),
        toLine('lt-stab-vacancy', 'Stabilized vacancy loss', -stabilizedVacancyMonthly),
        toLine('lt-stab-management', 'Stabilized management fee', -stabilizedManagementMonthly),
        toLine('lt-stab-maintenance', 'Stabilized maintenance reserve', -stabilizedMaintenanceMonthly),
        toLine('lt-stab-capex', 'Stabilized CapEx reserve', -stabilizedCapexMonthly),
        toLine('lt-stab-owner-expenses', 'Stabilized owner-paid expenses', -turnaroundSummary.ownerPaidExpensesMonthly),
        toLine('lt-stab-fixed-tax-ins', 'Fixed costs + tax/insurance adjustment', -stabilizedFixedAndTaxMonthly),
        toLine('lt-stab-variable-expenses', 'Variable expenses', -strategyVariableCosts),
        toLine('lt-stab-noi', 'NOI (stabilized)', turnaroundSummary.noiMonthly),
        toLine('lt-stab-debt-service', 'Debt service', -turnaroundSummary.debtServiceMonthly),
        toLine('lt-stab-cash-flow', 'Cash flow (stabilized, pre-tax)', turnaroundSummary.cashFlowPreTaxMonthly)
      ]
    : [];
  const outputMonthlyCashFlow = turnaroundSummary?.cashFlowPreTaxMonthly ?? monthly;
  const outputMaintenance = turnaroundSummary ? stabilizedMaintenanceMonthly : maintenance;
  const outputCapex = turnaroundSummary ? stabilizedCapexMonthly : capex;
  const outputAnnualCashFlow = turnaroundSummary?.annualCashFlowPreTax ?? annual;
  const outputNoiMonthly = turnaroundSummary?.noiMonthly ?? noi;
  const outputTotalCashNeeded = turnaroundSummary?.totalCashInvested ?? purchaseCashNeeded;
  const outputTimeline = turnaroundSummary?.cashFlowTimeline ?? timelineData.timeline;
  const outputSaleProceeds = turnaroundSummary?.saleProceeds ?? timelineData.saleProceeds;

  return {
    ...base,
    monthlyCashFlow: outputMonthlyCashFlow,
    monthlyCashFlowExcludingReserves: outputMonthlyCashFlow + outputMaintenance + outputCapex,
    annualCashFlow: outputAnnualCashFlow,
    capRate: turnaroundSummary?.capRate ?? (acquisitionBasisPrice <= 0 ? 0 : (noi * 12) / acquisitionBasisPrice),
    cashOnCashReturn: turnaroundSummary?.cashOnCashReturn ?? (purchaseCashNeeded === 0 ? 0 : annual / purchaseCashNeeded),
    dscr: turnaroundSummary?.dscr ?? calculateDscr(noi, debtService),
    roi: turnaroundSummary?.roi ?? timelineData.roi,
    totalCashNeeded: outputTotalCashNeeded,
    noiMonthly: outputNoiMonthly,
    irr: turnaroundSummary?.irr ?? timelineData.irr,
    saleProceeds: outputSaleProceeds,
    cashFlowTimeline: outputTimeline,
    notes: turnaroundSummary
      ? 'Buy-then-stabilize mode enabled: headline metrics show stabilized run-rate outputs, while IRR/ROI include the first 12 months from regular Long-Term inputs before stabilization.'
      : base.notes,
    calculationBreakdown: {
      lines: [
        ...longTermRevenueLines,
        {
          key: 'lt-tenant-placement-fyi',
          label: 'Tenant placement fee (one-time FYI, not included in KPIs)',
          monthly: 0,
          annual: -tenantPlacementFeeOneTime
        },
        toLine('lt-vacancy', 'Vacancy loss', -vacancy),
        toLine('lt-maintenance', 'Maintenance reserve', -maintenance),
        toLine('lt-capex', 'CapEx reserve', -capex),
        toLine('lt-management', 'Management fee', -managementFee),
        toLine('lt-owner-expenses', 'Owner expenses', -ownerExpensesMonthly),
        toLine('lt-fixed-costs', 'Fixed costs (tax/ins/hoa/pmi)', -fixedCosts),
        toLine('lt-variable-costs', 'Variable expenses', -strategyVariableCosts),
        toLine('lt-noi', 'NOI', noi),
        toLine('lt-debt-service', 'Debt service', -debtService),
        toLine('lt-cash-flow', 'Cash flow', monthly),
        ...turnaroundLines
      ],
      revenueMonthly: turnaroundSummary?.stabilizedGrossIncomeMonthly ?? gross,
      sellerPaidExpensesMonthly: turnaroundSummary?.operatingExpensesMonthly ?? (maintenance + capex + managementFee + ownerExpensesMonthly + fixedCosts + strategyVariableCosts),
      debtServiceMonthly: debtService,
      noiMonthly: outputNoiMonthly,
      cashFlowMonthly: outputMonthlyCashFlow
    },
    longTermTurnaroundSummary: turnaroundSummary
  };
};

export const calculateAirbnbStrategy = (input: DealInputModel, purchaseCashNeeded: number): StrategyOutput => {
  const { airbnb } = input;
  const base = createBaseOutput('airbnb', 'Short-term rental model with cleaning and platform drag.');

  const nightsPerMonth = Math.max(airbnb.nightsPerMonth, 0);
  const adr = Math.max(airbnb.adr, 0);
  const averageNightsPerBooking = Math.max(airbnb.averageNightsPerBooking, 1);
  const cleaningFeeCharged = Math.max(airbnb.cleaningFeeCharged, 0);
  const cleanerCostPerTurn = Math.max(airbnb.cleanerCostPerTurn, 0);
  const ownerExpensesMonthly = Math.max(airbnb.ownerExpensesMonthly, 0);
  const furnishingOneTime = Math.max(airbnb.furnishingOneTime, 0);
  const occupiedNights = nightsPerMonth * clampPercent(airbnb.occupancyPercent);
  const modeledRoomRevenue = occupiedNights * adr;
  const bookings = occupiedNights / averageNightsPerBooking;
  const modeledCleaningRevenue = bookings * cleaningFeeCharged;
  const annualRevenueOverrideMonthly = airbnb.annualRevenueOverride && airbnb.annualRevenueOverride > 0 ? airbnb.annualRevenueOverride / 12 : null;
  const roomRevenue = annualRevenueOverrideMonthly ?? modeledRoomRevenue;
  const cleaningRevenue = annualRevenueOverrideMonthly ? 0 : modeledCleaningRevenue;
  const gross = roomRevenue + cleaningRevenue;
  const feeBaseRevenue = annualRevenueOverrideMonthly ? gross : modeledRoomRevenue;

  const platformFees = feeBaseRevenue * clampPercent(airbnb.platformFeePercent);
  const cleanerCost = bookings * cleanerCostPerTurn;
  const maintenance = feeBaseRevenue * clampPercent(airbnb.maintenancePercent);
  const capex = feeBaseRevenue * clampPercent(airbnb.capexPercent);
  const managementFee = feeBaseRevenue * clampPercent(airbnb.managementFeePercent);

  const { debtService } = getPurchaseLoanTerms(input);
  const fixedCosts = getMonthlyFixedCosts(input);
  const strategyVariableCosts = getVariableExpenseTotal(input, 'airbnb');

  const noi = gross - platformFees - cleanerCost - maintenance - capex - managementFee - ownerExpensesMonthly - fixedCosts - strategyVariableCosts;
  const monthly = noi - debtService;
  const annual = monthly * 12;
  const investedCapital = purchaseCashNeeded + furnishingOneTime;
  const annualRevenueYear1 = gross * 12;
  const annualOperatingExpensesYear1 =
    (platformFees + cleanerCost + maintenance + capex + managementFee + ownerExpensesMonthly + fixedCosts + strategyVariableCosts) * 12;
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
  const acquisitionBasisPrice = getAcquisitionBasisPrice(input);

  return {
    ...base,
    monthlyCashFlow: monthly,
    monthlyCashFlowExcludingReserves: monthly + maintenance + capex,
    annualCashFlow: annual,
    capRate: acquisitionBasisPrice <= 0 ? 0 : (noi * 12) / acquisitionBasisPrice,
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
        ...(annualRevenueOverrideMonthly
          ? [toLine('str-annual-revenue-override', 'Annual revenue override (monthly equivalent)', gross)]
          : [
              toLine('str-room-revenue', 'Room revenue', roomRevenue),
              toLine('str-cleaning-revenue', 'Cleaning revenue', cleaningRevenue)
            ]),
        toLine('str-platform-fees', 'Platform fees', -platformFees),
        toLine('str-cleaner-cost', 'Cleaner cost', -cleanerCost),
        toLine('str-maintenance', 'Maintenance reserve', -maintenance),
        toLine('str-capex', 'CapEx reserve', -capex),
        toLine('str-management', 'Management fee', -managementFee),
        toLine('str-owner-expenses', 'Owner expenses / imported adjustments', -ownerExpensesMonthly),
        toLine('str-fixed-costs', 'Fixed costs (tax/ins/hoa/pmi)', -fixedCosts),
        toLine('str-variable-costs', 'Variable expenses', -strategyVariableCosts),
        toLine('str-noi', 'NOI', noi),
        toLine('str-debt-service', 'Debt service', -debtService),
        toLine('str-cash-flow', 'Cash flow', monthly)
      ],
      revenueMonthly: gross,
      sellerPaidExpensesMonthly: platformFees + cleanerCost + maintenance + capex + managementFee + ownerExpensesMonthly + fixedCosts + strategyVariableCosts,
      debtServiceMonthly: debtService,
      noiMonthly: noi,
      cashFlowMonthly: monthly
    }
  };
};

export const calculatePadSplitStrategy = (input: DealInputModel, purchaseCashNeeded: number): StrategyOutput => {
  const { padSplit } = input;
  const base = createBaseOutput('padSplit', 'Rent-by-room economics with platform and turn costs.');

  const legacyPadSplit = padSplit as DealInputModel['padSplit'] & { turnoverCostMonthly?: number };
  const rentableRooms = Math.max(Number.isFinite(padSplit.rentableRooms) ? padSplit.rentableRooms : 0, 0);
  const avgWeeklyRatePerRoom = Math.max(Number.isFinite(padSplit.avgWeeklyRatePerRoom) ? padSplit.avgWeeklyRatePerRoom : 0, 0);
  const weeksPerMonth = Math.max(Number.isFinite(padSplit.weeksPerMonth) ? padSplit.weeksPerMonth : 0, 0);
  const otherIncomeMonthly = Math.max(Number.isFinite(padSplit.otherIncomeMonthly) ? padSplit.otherIncomeMonthly : 0, 0);
  const moveOutsPerYear = Math.max(Number.isFinite(padSplit.moveOutsPerYear) ? padSplit.moveOutsPerYear : 0, 0);
  const rawTurnoverCostPerMoveOut = Number.isFinite(padSplit.turnoverCostPerMoveOut)
    ? padSplit.turnoverCostPerMoveOut
    : Number.isFinite(legacyPadSplit.turnoverCostMonthly)
      ? legacyPadSplit.turnoverCostMonthly ?? 0
      : 0;
  const turnoverCostPerMoveOut = Math.max(rawTurnoverCostPerMoveOut, 0);
  const ownerExpensesMonthly = Math.max(Number.isFinite(padSplit.ownerExpensesMonthly) ? padSplit.ownerExpensesMonthly : 0, 0);
  const furnishingOneTime = Math.max(Number.isFinite(padSplit.furnishingOneTime) ? padSplit.furnishingOneTime : 0, 0);
  const propertyManagementFeeMonthly = Math.max(
    Number.isFinite(padSplit.propertyManagementFeeMonthly) ? padSplit.propertyManagementFeeMonthly : 0,
    0
  );

  const gross =
    rentableRooms *
    avgWeeklyRatePerRoom *
    weeksPerMonth *
    clampPercent(padSplit.occupancyPercent) +
    otherIncomeMonthly;
  const annualRevenueOverrideMonthly = padSplit.annualRevenueOverride && padSplit.annualRevenueOverride > 0 ? padSplit.annualRevenueOverride / 12 : null;
  const effectiveGross = annualRevenueOverrideMonthly ?? gross;
  const platformFees = effectiveGross * clampPercent(padSplit.platformFeePercent);
  const maintenance = effectiveGross * clampPercent(padSplit.maintenancePercent);
  const capex = effectiveGross * clampPercent(padSplit.capexPercent);
  const managementFee = effectiveGross * clampPercent(padSplit.managementFeePercent);
  const turnoverMonthly = (turnoverCostPerMoveOut * moveOutsPerYear) / 12;
  const derivedWeeklyRatePerRoomFromOverride =
    annualRevenueOverrideMonthly && rentableRooms > 0 && weeksPerMonth > 0 && clampPercent(padSplit.occupancyPercent) > 0
      ? annualRevenueOverrideMonthly / (rentableRooms * weeksPerMonth * clampPercent(padSplit.occupancyPercent))
      : avgWeeklyRatePerRoom;
  const placementBaseWeeklyRate = avgWeeklyRatePerRoom > 0 ? avgWeeklyRatePerRoom : derivedWeeklyRatePerRoomFromOverride;
  const placementMonthly = (moveOutsPerYear * ((placementBaseWeeklyRate * 10) / 7)) / 12;

  const { debtService } = getPurchaseLoanTerms(input);
  const fixedCosts = getMonthlyFixedCosts(input);
  const strategyVariableCosts = getVariableExpenseTotal(input, 'padSplit');

  const noi =
    effectiveGross -
    platformFees -
    maintenance -
    capex -
    managementFee -
    propertyManagementFeeMonthly -
    turnoverMonthly -
    placementMonthly -
    ownerExpensesMonthly -
    fixedCosts -
    strategyVariableCosts;
  const monthly = noi - debtService;
  const annual = monthly * 12;
  const investedCapital = purchaseCashNeeded + furnishingOneTime;
  const annualRevenueYear1 = effectiveGross * 12;
  const annualOperatingExpensesYear1 =
    (platformFees +
      maintenance +
      capex +
      managementFee +
      propertyManagementFeeMonthly +
      turnoverMonthly +
      placementMonthly +
      ownerExpensesMonthly +
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
  const acquisitionBasisPrice = getAcquisitionBasisPrice(input);

  return {
    ...base,
    monthlyCashFlow: monthly,
    monthlyCashFlowExcludingReserves: monthly + maintenance + capex,
    annualCashFlow: annual,
    capRate: acquisitionBasisPrice <= 0 ? 0 : (noi * 12) / acquisitionBasisPrice,
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
        ...(annualRevenueOverrideMonthly
          ? [toLine('ps-annual-revenue-override', 'Annual revenue override (monthly equivalent)', effectiveGross)]
          : [toLine('ps-room-revenue', 'Room revenue', gross - otherIncomeMonthly), toLine('ps-other-income', 'Other income', otherIncomeMonthly)]),
        toLine('ps-platform-fees', 'Platform fees', -platformFees),
        toLine('ps-turnover-cleaning', 'Turnover / cleaning', -turnoverMonthly),
        toLine('ps-tenant-placement', 'Tenant placement fees', -placementMonthly),
        toLine('ps-maintenance', 'Maintenance reserve', -maintenance),
        toLine('ps-capex', 'CapEx reserve', -capex),
        toLine('ps-management', 'Management fee (%)', -managementFee),
        toLine('ps-property-management-flat', 'Property manager flat fee', -propertyManagementFeeMonthly),
        toLine('ps-owner-expenses', 'Owner expenses / imported adjustments', -ownerExpensesMonthly),
        toLine('ps-fixed-costs', 'Fixed costs (tax/ins/hoa/pmi)', -fixedCosts),
        toLine('ps-variable-costs', 'Variable expenses', -strategyVariableCosts),
        toLine('ps-noi', 'NOI', noi),
        toLine('ps-debt-service', 'Debt service', -debtService),
        toLine('ps-cash-flow', 'Cash flow', monthly)
      ],
      revenueMonthly: effectiveGross,
      sellerPaidExpensesMonthly:
        platformFees +
        turnoverMonthly +
        placementMonthly +
        maintenance +
        capex +
        managementFee +
        propertyManagementFeeMonthly +
        ownerExpensesMonthly +
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
  const brrrrRehabBudget = resolveRehabBudget(input, 'brrrr');
  const selectedOperatingNoi = operatingNoiByStrategy[brrrr.operatingStrategy] ?? operatingNoiByStrategy.longTerm;
  const base = createBaseOutput('brrrr', 'Buy-rehab-refi model blending hold costs and post-refi operation.');

  const strategyVariableCosts = getVariableExpenseTotal(input, brrrr.operatingStrategy);
  const setupCostOneTime = brrrr.operatingStrategy === 'airbnb' ? input.airbnb.furnishingOneTime : brrrr.operatingStrategy === 'padSplit' ? input.padSplit.furnishingOneTime : 0;
  const fixedCosts = getMonthlyFixedCosts(input);
  const purchaseLoanTerms = getPurchaseLoanTerms(input);
  const acquisitionDebtService = purchaseLoanTerms.debtService;
  const initialLoanPayoff = purchaseLoanTerms.primaryPrincipal;
  const holdingMonths = Math.max(brrrr.holdingMonths, 0);
  const purchaseCashComponent =
    purchase.ownershipMode === 'owned'
      ? 0
      : purchase.financingType === 'cash'
        ? Math.max(purchase.purchasePrice, 0)
        : Math.max(purchase.purchasePrice * purchase.downPaymentPercent, 0);
  const buyClosingCosts = purchase.ownershipMode === 'owned' ? 0 : Math.max(purchase.purchasePrice * purchase.closingCostPercent, 0);
  const pointsCost =
    purchase.ownershipMode === 'owned' || purchase.financingType !== 'loan'
      ? 0
      : Math.max(calculateLoanAmount(purchase.purchasePrice, purchase.downPaymentPercent) * purchase.pointsPercent, 0);
  const helocOffset = purchase.ownershipMode === 'owned' ? 0 : Math.max(purchase.helocAmount, 0);
  const helocClosingCosts = Math.max(purchase.helocClosingCosts, 0);
  const monthlyHoldingExpenses = Math.max(brrrr.holdingExpensesMonthly, 0);
  const brrrrPurchaseCashNeeded =
    purchase.ownershipMode === 'owned'
      ? Math.max(purchaseCashNeeded, 0) + Math.max(brrrrRehabBudget, 0)
      : Math.max(purchaseCashNeeded - Math.max(purchase.rehabBudget, 0) + Math.max(brrrrRehabBudget, 0), 0);
  const totalHoldingCosts = holdingMonths * (monthlyHoldingExpenses + fixedCosts + strategyVariableCosts + acquisitionDebtService);
  const investedAtPurchase = brrrrPurchaseCashNeeded + totalHoldingCosts + setupCostOneTime;
  const refiLoanAmount = (brrrrArv || 0) * brrrr.refinanceLtvPercent;
  const refiClosingCosts = refiLoanAmount * brrrr.refinanceClosingCostPercent;
  const cashBackAtRefiNet = refiLoanAmount - refiClosingCosts - initialLoanPayoff;
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
      cashFlowMonthly: monthly,
      brrrrMeta: {
        operatingStrategy: brrrr.operatingStrategy,
        holdingMonths,
        purchaseCashComponent,
        buyClosingCosts,
        pointsCost,
        rehabBudget: Math.max(brrrrRehabBudget, 0),
        helocOffset,
        helocClosingCosts,
        setupCostOneTime,
        monthlyHoldingExpenses,
        fixedHoldingCostsMonthly: fixedCosts,
        variableHoldingCostsMonthly: strategyVariableCosts,
        lenderHoldingCostsMonthly: acquisitionDebtService,
        holdingCostsTotal: totalHoldingCosts,
        investedAtPurchase,
        arvAtRefi: brrrrArv,
        refiLoanAmount,
        refiClosingCosts,
        initialLoanPayoff,
        cashBackAtRefiNet,
        investedAfterRefi,
        selectedOperatingNoi,
        refinanceDebt
      }
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
