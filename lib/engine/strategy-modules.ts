import {
  buildExcelParityAnnualTimeline,
  buildTimeline,
  calcTotalRoiFromTimeline,
  calculateIrr
} from '@/lib/engine/investment-math';
import type { DealInputModel, ExpenseStrategyKey, StrategyCalculationLineItem, StrategyOutput } from '@/lib/models/deal';
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

const toAnnual = (monthly: number): number => monthly * 12;

const toLine = (key: string, label: string, monthly: number): StrategyCalculationLineItem => ({
  key,
  label,
  monthly,
  annual: toAnnual(monthly)
});


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

const buildLeveredTimeline = (input: DealInputModel, totalCashNeeded: number, annualNoi: number, arv: number) => {
  const { purchase, assumptions } = input;

  const debts = [
    {
      principal: purchase.financingType === 'loan' ? calculateLoanAmount(purchase.purchasePrice, purchase.downPaymentPercent) : 0,
      annualRate: purchase.interestRate,
      termMonths: purchase.loanTermYears * 12,
      amortizationType: purchase.amortizationType
    },
    {
      principal: purchase.helocAmount,
      annualRate: purchase.helocRate,
      termMonths: purchase.helocTermYears * 12,
      amortizationType: purchase.helocAmortizationType
    }
  ];

  const timelineData = buildExcelParityAnnualTimeline({
    initialCashInvested: totalCashNeeded,
    annualNoiYear1: annualNoi,
    holdYears: assumptions.holdYears,
    noiGrowthRate: assumptions.noiGrowthPercent,
    appreciationRate: assumptions.annualAppreciationPercent,
    sellingCostRate: assumptions.sellingCostPercent,
    purchasePrice: purchase.purchasePrice,
    arv,
    debts
  });

  return {
    timeline: timelineData.flows,
    saleProceeds: timelineData.netSaleProceeds,
    irr: timelineData.irr,
    roi: timelineData.totalRoi
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
    notes: loanAmount > 0 ? base.notes : 'All-cash purchase basis and acquisition capital requirements.',
    calculationBreakdown: {
      lines: [
        toLine('purchase-debt-service', 'Debt service', -debtService)
      ],
      revenueMonthly: 0,
      sellerPaidExpensesMonthly: 0,
      debtServiceMonthly: debtService,
      noiMonthly: -debtService,
      cashFlowMonthly: -debtService
    }
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
  const timelineData = buildLeveredTimeline(input, purchaseCashNeeded, annualNoi, resolveStrategyArv(input, 'longTerm'));

  return {
    ...base,
    monthlyCashFlow: monthly,
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
  const timelineData = buildLeveredTimeline(input, investedCapital, annualNoi, resolveStrategyArv(input, 'airbnb'));

  return {
    ...base,
    monthlyCashFlow: monthly,
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
    padSplit.occupancyPercent +
    padSplit.otherIncomeMonthly;
  const platformFees = gross * padSplit.platformFeePercent;
  const maintenance = gross * padSplit.maintenancePercent;
  const capex = gross * padSplit.capexPercent;
  const managementFee = gross * padSplit.managementFeePercent;
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
  const annualNoi = noi * 12;
  const timelineData = buildLeveredTimeline(input, investedCapital, annualNoi, resolveStrategyArv(input, 'padSplit'));

  return {
    ...base,
    monthlyCashFlow: monthly,
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
  const timelineData = buildExcelParityAnnualTimeline({
    initialCashInvested: investedAfterRefi,
    annualNoiYear1: annualNoi,
    holdYears: input.assumptions.holdYears,
    noiGrowthRate: input.assumptions.noiGrowthPercent,
    appreciationRate: input.assumptions.annualAppreciationPercent,
    sellingCostRate: input.assumptions.sellingCostPercent,
    purchasePrice: purchase.purchasePrice,
    arv: brrrrArv,
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
    annualCashFlow: annual,
    capRate: brrrrArv === 0 ? 0 : (selectedOperatingNoi * 12) / brrrrArv,
    cashOnCashReturn: investedAfterRefi === 0 ? 0 : annual / investedAfterRefi,
    dscr: calculateDscr(selectedOperatingNoi, refinanceDebt),
    roi: timelineData.totalRoi,
    totalCashNeeded: investedAfterRefi,
    noiMonthly: selectedOperatingNoi,
    irr: timelineData.irr,
    saleProceeds: timelineData.netSaleProceeds,
    cashFlowTimeline: timelineData.flows,
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
