import {
  buildTimeline,
  buildSpreadsheetStyleTimeline,
  calcTotalRoiFromTimeline,
  calculateIrr,
  estimateSaleProceeds,
  getAcquisitionDebtPayoffAtMonth
} from '@/lib/engine/investment-math';
import type { DealInputModel, ExpenseStrategyKey, StrategyOutput } from '@/lib/models/deal';
import { calculateAcquisitionDebtService, calculateCashToClose, calculateLoanAmount, calculateMonthlyPayment } from '@/lib/engine/finance';

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
    helocAmortizationType: purchase.helocAmortizationType
  });
};

const getMonthlyFixedCosts = (input: DealInputModel): number => {
  const { purchase } = input;
  const annualTax = purchase.propertyTaxAnnualOverride ?? purchase.purchasePrice * 0.017;
  const annualInsurance = purchase.insuranceAnnualOverride ?? purchase.purchasePrice * 0.01;

  return annualTax / 12 + annualInsurance / 12 + purchase.hoaMonthly + purchase.pmiMonthly;
};

const getVariableExpenseTotal = (input: DealInputModel, strategy: ExpenseStrategyKey): number => {
  return input.variableExpenses.reduce((sum, expense) => {
    return expense.appliesTo[strategy] ? sum + expense.monthlyAmount : sum;
  }, 0);
};

const calculateDscr = (noiMonthly: number, debtServiceMonthly: number): number => {
  if (debtServiceMonthly <= 0) return 0;
  return noiMonthly / debtServiceMonthly;
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

const buildLeveredTimeline = (
  input: DealInputModel,
  totalCashNeeded: number,
  annualNoi: number,
  annualDebtService: number,
  primaryLoanAmount: number,
  arv: number
) => {
  const { purchase, assumptions } = input;

  const remainingBalance = getAcquisitionDebtPayoffAtMonth({
    financingType: purchase.financingType,
    initialLoanAmount: primaryLoanAmount,
    annualRate: purchase.interestRate,
    termYears: purchase.loanTermYears,
    monthsElapsed: assumptions.holdYears * 12,
    amortizationType: purchase.amortizationType,
    helocAmount: purchase.helocAmount,
    helocRate: purchase.helocRate,
    helocTermYears: purchase.helocTermYears,
    helocAmortizationType: purchase.helocAmortizationType
  });

  const saleProceeds = estimateSaleProceeds(
    purchase.purchasePrice,
    arv,
    assumptions.annualAppreciationPercent,
    assumptions.sellingCostPercent,
    remainingBalance,
    assumptions.holdYears
  );

  const timeline = buildSpreadsheetStyleTimeline({
    initialCashOut: totalCashNeeded,
    baseAnnualNoi: annualNoi,
    annualDebtService,
    holdYears: assumptions.holdYears,
    noiGrowthPercent: assumptions.noiGrowthPercent,
    saleProceeds
  });

  return {
    timeline,
    saleProceeds,
    irr: calculateIrr(timeline)
  };
};


export const calculatePurchaseStrategy = (input: DealInputModel): StrategyOutput => {
  const { purchase, assumptions } = input;
  const base = createBaseOutput('purchase', 'Core financing and cash required to acquire the deal.');

  const { principal: loanAmount, debtService } = getPurchaseLoanTerms(input);

  const cashToClose = calculateCashToClose(
    purchase.purchasePrice,
    purchase.rehabBudget,
    purchase.downPaymentPercent,
    purchase.closingCostPercent,
    purchase.pointsPercent,
    purchase.financingType,
    purchase.helocAmount,
    purchase.helocClosingCosts
  );

  const annualCashFlow = -debtService * 12;
  const timeline = buildTimeline(cashToClose, annualCashFlow, assumptions.holdYears, 0, 0);

  return {
    ...base,
    monthlyCashFlow: -debtService,
    annualCashFlow,
    totalCashNeeded: cashToClose,
    dscr: 0,
    roi: calcTotalRoiFromTimeline(timeline),
    irr: calculateIrr(timeline),
    cashFlowTimeline: timeline,
    saleProceeds: 0,
    noiMonthly: -debtService,
    notes: loanAmount > 0 ? base.notes : 'All-cash purchase basis and acquisition capital requirements.'
  };
};

export const calculateLongTermStrategy = (input: DealInputModel, purchaseCashNeeded: number): StrategyOutput => {
  const { longTerm, purchase } = input;
  const base = createBaseOutput('longTerm', 'Stabilized buy-and-hold with reserves and fixed expenses.');

  const { debtService } = getPurchaseLoanTerms(input);
  const fixedCosts = getMonthlyFixedCosts(input);
  const strategyVariableCosts = getVariableExpenseTotal(input, 'longTerm');

  const gross = longTerm.grossRentMonthly + longTerm.otherIncomeMonthly;
  const vacancy = gross * longTerm.vacancyPercent;
  const effectiveGrossIncome = gross - vacancy;
  const maintenance = effectiveGrossIncome * longTerm.maintenancePercent;
  const capex = effectiveGrossIncome * longTerm.capexPercent;
  const managementFee = effectiveGrossIncome * longTerm.managementFeePercent;
  const noi = effectiveGrossIncome - maintenance - capex - managementFee - longTerm.ownerExpensesMonthly - fixedCosts - strategyVariableCosts;
  const monthly = noi - debtService;
  const annual = monthly * 12;
  const annualNoi = noi * 12;
  const annualDebtService = debtService * 12;

  const timelineData = buildLeveredTimeline(
    input,
    purchaseCashNeeded,
    annualNoi,
    annualDebtService,
    getPurchaseLoanTerms(input).primaryPrincipal,
    resolveStrategyArv(input, 'longTerm')
  );

  return {
    ...base,
    monthlyCashFlow: monthly,
    annualCashFlow: annual,
    capRate: purchase.purchasePrice === 0 ? 0 : (noi * 12) / purchase.purchasePrice,
    cashOnCashReturn: purchaseCashNeeded === 0 ? 0 : annual / purchaseCashNeeded,
    dscr: calculateDscr(noi, debtService),
    roi: calcTotalRoiFromTimeline(timelineData.timeline),
    totalCashNeeded: purchaseCashNeeded,
    noiMonthly: noi,
    irr: timelineData.irr,
    saleProceeds: timelineData.saleProceeds,
    cashFlowTimeline: timelineData.timeline
  };
};

export const calculateAirbnbStrategy = (input: DealInputModel, purchaseCashNeeded: number): StrategyOutput => {
  const { airbnb, purchase } = input;
  const base = createBaseOutput('airbnb', 'Short-term rental model with cleaning and platform drag.');

  const occupiedNights = airbnb.nightsPerMonth * airbnb.occupancyPercent;
  const roomRevenue = occupiedNights * airbnb.adr;
  const bookings = occupiedNights / Math.max(airbnb.averageNightsPerBooking, 1);
  const cleaningRevenue = bookings * airbnb.cleaningFeeCharged;
  const gross = roomRevenue + cleaningRevenue;

  const platformFees = gross * airbnb.platformFeePercent;
  const cleanerCost = bookings * airbnb.cleanerCostPerTurn;
  const maintenance = gross * airbnb.maintenancePercent;
  const capex = gross * airbnb.capexPercent;
  const managementFee = gross * airbnb.managementFeePercent;

  const { debtService } = getPurchaseLoanTerms(input);
  const fixedCosts = getMonthlyFixedCosts(input);
  const strategyVariableCosts = getVariableExpenseTotal(input, 'airbnb');

  const noi = gross - platformFees - cleanerCost - maintenance - capex - managementFee - airbnb.ownerExpensesMonthly - fixedCosts - strategyVariableCosts;
  const monthly = noi - debtService;
  const annual = monthly * 12;
  const investedCapital = purchaseCashNeeded + airbnb.furnishingOneTime;
  const annualNoi = noi * 12;
  const annualDebtService = debtService * 12;

  const timelineData = buildLeveredTimeline(
    input,
    investedCapital,
    annualNoi,
    annualDebtService,
    getPurchaseLoanTerms(input).primaryPrincipal,
    resolveStrategyArv(input, 'airbnb')
  );

  return {
    ...base,
    monthlyCashFlow: monthly,
    annualCashFlow: annual,
    capRate: purchase.purchasePrice === 0 ? 0 : (noi * 12) / purchase.purchasePrice,
    cashOnCashReturn: investedCapital === 0 ? 0 : annual / investedCapital,
    dscr: calculateDscr(noi, debtService),
    roi: calcTotalRoiFromTimeline(timelineData.timeline),
    totalCashNeeded: investedCapital,
    noiMonthly: noi,
    irr: timelineData.irr,
    saleProceeds: timelineData.saleProceeds,
    cashFlowTimeline: timelineData.timeline
  };
};

export const calculatePadSplitStrategy = (input: DealInputModel, purchaseCashNeeded: number): StrategyOutput => {
  const { padSplit, purchase } = input;
  const base = createBaseOutput('padSplit', 'Rent-by-room economics with platform and turn costs.');

  const gross =
    padSplit.rentableRooms *
    padSplit.avgWeeklyRatePerRoom *
    padSplit.weeksPerMonth *
    padSplit.occupancyPercent +
    padSplit.otherIncomeMonthly;
  const platformFees = gross * padSplit.platformFeePercent;
  const maintenance = gross * padSplit.maintenancePercent;
  const capex = gross * padSplit.capexPercent;
  const managementFee = gross * padSplit.managementFeePercent;

  const { debtService } = getPurchaseLoanTerms(input);
  const fixedCosts = getMonthlyFixedCosts(input);
  const strategyVariableCosts = getVariableExpenseTotal(input, 'padSplit');

  const noi =
    gross -
    platformFees -
    maintenance -
    capex -
    managementFee -
    padSplit.turnoverCostMonthly -
    padSplit.ownerExpensesMonthly -
    fixedCosts -
    strategyVariableCosts;
  const monthly = noi - debtService;
  const annual = monthly * 12;
  const investedCapital = purchaseCashNeeded + padSplit.furnishingOneTime;
  const annualNoi = noi * 12;
  const annualDebtService = debtService * 12;

  const timelineData = buildLeveredTimeline(
    input,
    investedCapital,
    annualNoi,
    annualDebtService,
    getPurchaseLoanTerms(input).primaryPrincipal,
    resolveStrategyArv(input, 'padSplit')
  );

  return {
    ...base,
    monthlyCashFlow: monthly,
    annualCashFlow: annual,
    capRate: purchase.purchasePrice === 0 ? 0 : (noi * 12) / purchase.purchasePrice,
    cashOnCashReturn: investedCapital === 0 ? 0 : annual / investedCapital,
    dscr: calculateDscr(noi, debtService),
    roi: calcTotalRoiFromTimeline(timelineData.timeline),
    totalCashNeeded: investedCapital,
    noiMonthly: noi,
    irr: timelineData.irr,
    saleProceeds: timelineData.saleProceeds,
    cashFlowTimeline: timelineData.timeline
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
  const annualDebtService = refinanceDebt * 12;

  const remainingRefiBalance = getAcquisitionDebtPayoffAtMonth({
    financingType: refiLoanAmount > 0 ? 'loan' : 'cash',
    initialLoanAmount: refiLoanAmount,
    annualRate: brrrr.refinanceRate,
    termYears: purchase.loanTermYears,
    monthsElapsed: input.assumptions.holdYears * 12,
    amortizationType: 'PI',
    helocAmount: 0,
    helocRate: 0,
    helocTermYears: 1,
    helocAmortizationType: 'PI'
  });
  const saleProceeds = estimateSaleProceeds(
    purchase.purchasePrice,
    brrrrArv,
    input.assumptions.annualAppreciationPercent,
    input.assumptions.sellingCostPercent,
    remainingRefiBalance,
    input.assumptions.holdYears
  );
  const timeline = buildSpreadsheetStyleTimeline({
    initialCashOut: investedAfterRefi,
    baseAnnualNoi: annualNoi,
    annualDebtService,
    holdYears: input.assumptions.holdYears,
    noiGrowthPercent: input.assumptions.noiGrowthPercent,
    saleProceeds
  });

  const irr = calculateIrr(timeline);

  return {
    ...base,
    monthlyCashFlow: monthly,
    annualCashFlow: annual,
    capRate: brrrrArv === 0 ? 0 : (selectedOperatingNoi * 12) / brrrrArv,
    cashOnCashReturn: investedAfterRefi === 0 ? 0 : annual / investedAfterRefi,
    dscr: calculateDscr(selectedOperatingNoi, refinanceDebt),
    roi: calcTotalRoiFromTimeline(timeline),
    totalCashNeeded: investedAfterRefi,
    noiMonthly: selectedOperatingNoi,
    irr,
    saleProceeds,
    cashFlowTimeline: timeline
  };
};

export const calculateFlipStrategy = (input: DealInputModel, purchaseCashNeeded: number): StrategyOutput => {
  const { flip, purchase } = input;
  const flipArv = resolveStrategyArv(input, 'flip');
  const flipRehabBudget = resolveRehabBudget(input, 'flip');
  const base = createBaseOutput('flip', 'Renovate and sell analysis including carry and transaction friction.');

  const salePrice = flipArv;
  const agentCommission = salePrice * flip.agentCommissionPercent;
  const closingCosts = salePrice * flip.sellClosingCostPercent;
  const strategyVariableCosts = getVariableExpenseTotal(input, 'flip');
  const fixedCosts = getMonthlyFixedCosts(input);
  const debtService = getPurchaseLoanTerms(input).debtService;
  const holdingCosts = flip.holdingMonths * (flip.holdingExpensesMonthly + fixedCosts + strategyVariableCosts + debtService);

  const netProfit =
    salePrice -
    purchase.purchasePrice -
    flipRehabBudget -
    purchase.purchasePrice * purchase.closingCostPercent -
    agentCommission -
    closingCosts -
    flip.sellerConcessions -
    holdingCosts;

  const totalCashInvested = purchaseCashNeeded + holdingCosts;
  const monthly = netProfit / Math.max(flip.holdingMonths, 1);
  const timeline = [-Math.abs(totalCashInvested), totalCashInvested + netProfit];

  return {
    ...base,
    monthlyCashFlow: monthly,
    annualCashFlow: monthly * 12,
    cashOnCashReturn: totalCashInvested === 0 ? 0 : netProfit / totalCashInvested,
    dscr: 0,
    roi: calcTotalRoiFromTimeline(timeline),
    totalCashNeeded: purchaseCashNeeded + holdingCosts,
    irr: calculateIrr(timeline),
    saleProceeds: netProfit,
    cashFlowTimeline: timeline
  };
};
