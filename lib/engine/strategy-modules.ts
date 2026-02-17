import {
  buildTimeline,
  calculateIrr,
  calculateRemainingBalance,
  estimateSaleProceeds,
  getAcquisitionDebtPayoffAtMonth
} from '@/lib/engine/investment-math';
import type { DealInputModel, ExpenseStrategyKey, StrategyOutput } from '@/lib/models/deal';
import { calculateAcquisitionDebtService, calculateCashToClose, calculateMonthlyPayment } from '@/lib/engine/finance';

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
    helocRate: purchase.helocRate
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

const buildLeveredTimeline = (
  input: DealInputModel,
  totalCashNeeded: number,
  annualCashFlow: number,
  loanAmount: number,
  loanRate: number,
  loanTermYears: number,
  amortizationType = input.purchase.amortizationType
) => {
  const { purchase, assumptions } = input;

  const remainingBalance = calculateRemainingBalance(
    loanAmount,
    loanRate,
    loanTermYears,
    assumptions.holdYears,
    amortizationType
  );

  const saleProceeds = estimateSaleProceeds(
    purchase.purchasePrice,
    purchase.arv,
    assumptions.annualAppreciationPercent,
    assumptions.sellingCostPercent,
    remainingBalance,
    assumptions.holdYears
  );

  const timeline = buildTimeline(
    totalCashNeeded,
    annualCashFlow,
    assumptions.holdYears,
    assumptions.noiGrowthPercent,
    saleProceeds
  );

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
    roi: 0,
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

  const { principal: loanAmount, debtService } = getPurchaseLoanTerms(input);
  const fixedCosts = getMonthlyFixedCosts(input);
  const strategyVariableCosts = getVariableExpenseTotal(input, 'longTerm');

  const gross = longTerm.grossRentMonthly + longTerm.otherIncomeMonthly;
  const vacancy = gross * longTerm.vacancyPercent;
  const maintenance = gross * longTerm.maintenancePercent;
  const capex = gross * longTerm.capexPercent;
  const noi = gross - vacancy - maintenance - capex - longTerm.ownerExpensesMonthly - fixedCosts - strategyVariableCosts;
  const monthly = noi - debtService;
  const annual = monthly * 12;

  const timelineData = buildLeveredTimeline(
    input,
    purchaseCashNeeded,
    annual,
    loanAmount,
    purchase.financingType === 'heloc' ? purchase.helocRate : purchase.interestRate,
    purchase.loanTermYears
  );

  return {
    ...base,
    monthlyCashFlow: monthly,
    annualCashFlow: annual,
    capRate: purchase.purchasePrice === 0 ? 0 : (noi * 12) / purchase.purchasePrice,
    cashOnCashReturn: purchaseCashNeeded === 0 ? 0 : annual / purchaseCashNeeded,
    dscr: calculateDscr(noi, debtService),
    roi: purchaseCashNeeded === 0 ? 0 : (annual * input.assumptions.holdYears) / purchaseCashNeeded,
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

  const { principal: loanAmount, debtService } = getPurchaseLoanTerms(input);
  const fixedCosts = getMonthlyFixedCosts(input);
  const strategyVariableCosts = getVariableExpenseTotal(input, 'airbnb');

  const noi = gross - platformFees - cleanerCost - airbnb.ownerExpensesMonthly - fixedCosts - strategyVariableCosts;
  const monthly = noi - debtService;
  const annual = monthly * 12;

  const timelineData = buildLeveredTimeline(
    input,
    purchaseCashNeeded,
    annual,
    loanAmount,
    purchase.financingType === 'heloc' ? purchase.helocRate : purchase.interestRate,
    purchase.loanTermYears
  );

  return {
    ...base,
    monthlyCashFlow: monthly,
    annualCashFlow: annual,
    capRate: purchase.purchasePrice === 0 ? 0 : (noi * 12) / purchase.purchasePrice,
    cashOnCashReturn: purchaseCashNeeded === 0 ? 0 : annual / purchaseCashNeeded,
    dscr: calculateDscr(noi, debtService),
    roi: purchaseCashNeeded === 0 ? 0 : (annual * input.assumptions.holdYears) / purchaseCashNeeded,
    totalCashNeeded: purchaseCashNeeded,
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
    padSplit.occupancyPercent;
  const platformFees = gross * padSplit.platformFeePercent;

  const { principal: loanAmount, debtService } = getPurchaseLoanTerms(input);
  const fixedCosts = getMonthlyFixedCosts(input);
  const strategyVariableCosts = getVariableExpenseTotal(input, 'padSplit');

  const noi = gross - platformFees - padSplit.turnoverCostMonthly - padSplit.ownerExpensesMonthly - fixedCosts - strategyVariableCosts;
  const monthly = noi - debtService;
  const annual = monthly * 12;
  const investedCapital = purchaseCashNeeded + padSplit.furnishingOneTime;

  const timelineData = buildLeveredTimeline(
    input,
    investedCapital,
    annual,
    loanAmount,
    purchase.financingType === 'heloc' ? purchase.helocRate : purchase.interestRate,
    purchase.loanTermYears
  );

  return {
    ...base,
    monthlyCashFlow: monthly,
    annualCashFlow: annual,
    capRate: purchase.purchasePrice === 0 ? 0 : (noi * 12) / purchase.purchasePrice,
    cashOnCashReturn: investedCapital === 0 ? 0 : annual / investedCapital,
    dscr: calculateDscr(noi, debtService),
    roi: investedCapital === 0 ? 0 : (annual * input.assumptions.holdYears) / investedCapital,
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
  longTermNoiMonthly: number
): StrategyOutput => {
  const { brrrr, purchase } = input;
  const base = createBaseOutput('brrrr', 'Buy-rehab-refi model blending hold costs and post-refi operation.');

  const strategyVariableCosts = getVariableExpenseTotal(input, 'flip');
  const fixedCosts = getMonthlyFixedCosts(input);
  const totalHoldingCosts = brrrr.holdingMonths * (brrrr.holdingExpensesMonthly + fixedCosts + strategyVariableCosts);
  const refiLoanAmount = purchase.arv * brrrr.refinanceLtvPercent;
  const refiClosingCosts = refiLoanAmount * brrrr.refinanceClosingCostPercent;

  const initialAcquisitionDebt = getPurchaseLoanTerms(input).principal;
  const payoffInitialLoan = getAcquisitionDebtPayoffAtMonth({
    financingType: purchase.financingType,
    initialLoanAmount: initialAcquisitionDebt,
    annualRate: purchase.interestRate,
    termYears: purchase.loanTermYears,
    monthsElapsed: brrrr.holdingMonths,
    amortizationType: purchase.amortizationType,
    helocAmount: purchase.helocAmount
  });

  const equityAfterRefi = purchase.arv - refiLoanAmount;
  const cashBackAtRefi = refiLoanAmount - payoffInitialLoan - purchase.rehabBudget - refiClosingCosts;
  const investedAfterRefi = purchaseCashNeeded - cashBackAtRefi;

  const refinanceDebt = calculateMonthlyPayment(refiLoanAmount, brrrr.refinanceRate, purchase.loanTermYears);
  const monthly = longTermNoiMonthly - refinanceDebt;
  const annual = monthly * 12;

  const timelineData = buildLeveredTimeline(
    input,
    purchaseCashNeeded + totalHoldingCosts,
    annual,
    refiLoanAmount,
    brrrr.refinanceRate,
    purchase.loanTermYears,
    'PI'
  );
  const timeline = [...timelineData.timeline];

  if (timeline.length === 1) {
    timeline.push(cashBackAtRefi);
  } else {
    timeline[1] += cashBackAtRefi;
  }

  const irr = calculateIrr(timeline);

  return {
    ...base,
    monthlyCashFlow: monthly,
    annualCashFlow: annual,
    capRate: purchase.purchasePrice === 0 ? 0 : (longTermNoiMonthly * 12) / purchase.purchasePrice,
    cashOnCashReturn: investedAfterRefi === 0 ? 0 : annual / investedAfterRefi,
    dscr: calculateDscr(longTermNoiMonthly, refinanceDebt),
    roi: investedAfterRefi === 0 ? 0 : ((annual * input.assumptions.holdYears) + equityAfterRefi) / investedAfterRefi,
    totalCashNeeded: purchaseCashNeeded + totalHoldingCosts,
    noiMonthly: longTermNoiMonthly,
    irr,
    saleProceeds: timelineData.saleProceeds,
    cashFlowTimeline: timeline
  };
};

export const calculateFlipStrategy = (input: DealInputModel, purchaseCashNeeded: number): StrategyOutput => {
  const { flip, purchase } = input;
  const base = createBaseOutput('flip', 'Renovate and sell analysis including carry and transaction friction.');

  const salePrice = purchase.arv;
  const agentCommission = salePrice * flip.agentCommissionPercent;
  const closingCosts = salePrice * flip.sellClosingCostPercent;
  const strategyVariableCosts = getVariableExpenseTotal(input, 'flip');
  const fixedCosts = getMonthlyFixedCosts(input);
  const holdingCosts = flip.holdingMonths * (flip.holdingExpensesMonthly + fixedCosts + strategyVariableCosts);

  const netProfit =
    salePrice -
    purchase.purchasePrice -
    purchase.rehabBudget -
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
    cashOnCashReturn: purchaseCashNeeded === 0 ? 0 : netProfit / purchaseCashNeeded,
    dscr: 0,
    roi: purchaseCashNeeded === 0 ? 0 : netProfit / purchaseCashNeeded,
    totalCashNeeded: purchaseCashNeeded + holdingCosts,
    irr: calculateIrr(timeline),
    saleProceeds: netProfit,
    cashFlowTimeline: timeline
  };
};
