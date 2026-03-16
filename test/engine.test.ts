import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateDeal } from '../lib/engine/deal-engine';
import { calculateInterestOnlyPayment, calculateLoanAmount, calculateMonthlyPayment } from '../lib/engine/finance';
import { buildExcelParityAnnualTimeline, calcTotalRoiFromTimeline, calculateRemainingBalance, estimateSaleProceeds } from '../lib/engine/investment-math';
import { defaultDealInput, type StrategyOutput } from '../lib/models/deal';
import { getProjectionMetrics } from '../lib/projection-metrics';

import { createScenarioRecord, decodeScenario, encodeScenario } from '../lib/scenario-storage';
import { createPdfReportSchema } from '../lib/export/pdf-schema';

const near = (actual: number, expected: number, epsilon = 0.01) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `Expected ${actual} to be within ${epsilon} of ${expected}`);
};

const fixedCostsMonthly = (input = defaultDealInput) => {
  if (input.purchase.ownershipMode === 'owned') {
    return (
      input.purchase.existingTaxMonthly +
      input.purchase.existingInsuranceMonthly +
      input.purchase.hoaMonthly +
      input.purchase.pmiMonthly
    );
  }

  const annualTax = input.purchase.propertyTaxAnnualOverride ?? input.purchase.purchasePrice * 0.017;
  const annualInsurance = input.purchase.insuranceAnnualOverride ?? input.purchase.purchasePrice * 0.01;
  return annualTax / 12 + annualInsurance / 12 + input.purchase.hoaMonthly + input.purchase.pmiMonthly;
};

const variableCostMonthly = (strategy: 'purchase' | 'longTerm' | 'airbnb' | 'padSplit' | 'flip', input = defaultDealInput) =>
  input.variableExpenses.reduce((sum, entry) => (entry.appliesTo[strategy] ? sum + entry.monthlyAmount : sum), 0);

const createProjectionOutput = (overrides: Partial<StrategyOutput>): StrategyOutput => ({
  strategy: 'longTerm',
  monthlyCashFlow: 0,
  annualCashFlow: 0,
  capRate: 0,
  cashOnCashReturn: 0,
  dscr: 0,
  roi: 0,
  irr: 0,
  totalCashNeeded: 0,
  notes: '',
  noiMonthly: 0,
  saleProceeds: 0,
  cashFlowTimeline: [],
  ...overrides
});


test('excel parity timeline indexes property value, NOI, flows, and ROI exactly like Master Summary', () => {
  const holdYears = 5;
  const noiYear1 = 24000;
  const noiGrowth = 0.03;
  const appreciation = 0.04;
  const purchasePrice = 200000;
  const arv = 260000;
  const initialCash = 70000;
  const sellingCostRate = 0.08;

  const timeline = buildExcelParityAnnualTimeline({
    initialCashInvested: initialCash,
    annualNoiYear1: noiYear1,
    holdYears,
    noiGrowthRate: noiGrowth,
    appreciationRate: appreciation,
    sellingCostRate,
    purchasePrice,
    arv,
    debts: [
      {
        principal: 150000,
        annualRate: 0.07,
        termMonths: 360,
        amortizationType: 'PI'
      }
    ]
  });

  const expectedPropertyValueN = arv * Math.pow(1 + appreciation, holdYears);
  const expectedNoiN = noiYear1 * Math.pow(1 + noiGrowth, holdYears - 1);
  const finalYearNoSale = expectedNoiN - timeline.annualDebtService;

  near(timeline.propertyValueByYear[holdYears - 1], expectedPropertyValueN, 1e-6);
  near(timeline.noiByYear[holdYears - 1], expectedNoiN, 1e-6);
  assert.equal(timeline.flows.length, holdYears + 1);
  near(timeline.flows[holdYears], finalYearNoSale + timeline.netSaleProceeds, 1e-6);
  near(timeline.totalRoi, timeline.flows.reduce((sum, flow) => sum + flow, 0) / Math.abs(timeline.flows[0]), 1e-6);
});

test('excel parity timeline keeps sale proceeds in year N (no extra year)', () => {
  const holdYears = 7;
  const timeline = buildExcelParityAnnualTimeline({
    initialCashInvested: 50000,
    annualNoiYear1: 18000,
    holdYears,
    noiGrowthRate: 0.025,
    appreciationRate: 0.035,
    sellingCostRate: 0.07,
    purchasePrice: 180000,
    arv: 0,
    debts: [
      {
        principal: 120000,
        annualRate: 0.065,
        termMonths: 360,
        amortizationType: 'PI'
      }
    ]
  });

  assert.equal(timeline.flows.length, holdYears + 1);
  assert.ok(Number.isFinite(timeline.flows[holdYears]));
});

test('projection metrics separate operating cash flow from sale cash and compute modeled exit from the timeline', () => {
  const output = createProjectionOutput({
    strategy: 'longTerm',
    totalCashNeeded: 100000,
    saleProceeds: 65000,
    cashFlowTimeline: [-100000, 12000, 12600, 13230 + 65000]
  });

  const metrics = getProjectionMetrics(output, 3);

  near(metrics.cumulativeOperatingCashFlow, 37830, 1e-6);
  near(metrics.exitCashReturned, 65000, 1e-6);
  near(metrics.modeledTotalReturn, 102830, 1e-6);
  near(metrics.modeledProfit, 2830, 1e-6);
  near(metrics.modeledMultiple, 1.0283, 1e-6);
  assert.equal(metrics.paybackMonths, 36);
});

test('projection metrics compute month-based payback from modeled period cash flows', () => {
  const output = createProjectionOutput({
    strategy: 'longTerm',
    totalCashNeeded: 24000,
    saleProceeds: 0,
    cashFlowTimeline: [-24000, 12000, 24000]
  });

  const metrics = getProjectionMetrics(output, 2);

  assert.equal(metrics.paybackMonths, 18);
});

test('projection metrics compute month-based break-even from modeled sale cash before the final hold month', () => {
  const input = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      purchasePrice: 100000,
      arv: 100000,
      rehabBudget: 0,
      downPaymentPercent: 0.2,
      closingCostPercent: 0,
      interestRate: 0,
      loanTermYears: 30,
      pointsPercent: 0,
      financingType: 'loan' as const,
      amortizationType: 'PI' as const,
      helocAmount: 0
    },
    assumptions: {
      ...defaultDealInput.assumptions,
      holdYears: 10,
      annualAppreciationPercent: 0,
      sellingCostPercent: 0.08
    }
  };
  const finalSaleCash = 100000 * (1 - 0.08) - calculateRemainingBalance(80000, 0, 30, 10, 'PI');
  const output = createProjectionOutput({
    strategy: 'longTerm',
    totalCashNeeded: 20000,
    saleProceeds: finalSaleCash,
    cashFlowTimeline: [-20000, 0, 0, 0, 0, 0, 0, 0, 0, 0, finalSaleCash]
  });

  const metrics = getProjectionMetrics(output, 10, input);

  assert.equal(metrics.paybackMonths, 36);
});

test('projection metrics treat flip exit cash as the full terminal return and keep operating cash flow at zero', () => {
  const output = createProjectionOutput({
    strategy: 'flip',
    totalCashNeeded: 30000,
    saleProceeds: 5000,
    cashFlowTimeline: [-30000, 35000],
    calculationBreakdown: {
      lines: [],
      revenueMonthly: 0,
      sellerPaidExpensesMonthly: 0,
      debtServiceMonthly: 0,
      noiMonthly: 0,
      cashFlowMonthly: 0,
      flipMeta: {
        holdingMonths: 6,
        salePrice: 0,
        purchasePrice: 0,
        rehabBudget: 0,
        buyClosingCosts: 0,
        agentCommission: 0,
        sellClosingCosts: 0,
        sellerConcessions: 0,
        fixedHoldingCostsMonthly: 0,
        variableHoldingCostsMonthly: 0,
        lenderHoldingCostsMonthly: 0,
        holdingCostsTotal: 0,
        netProfit: 5000
      }
    }
  });

  const metrics = getProjectionMetrics(output, 10);

  near(metrics.cumulativeOperatingCashFlow, 0, 1e-6);
  near(metrics.exitCashReturned, 35000, 1e-6);
  near(metrics.modeledTotalReturn, 35000, 1e-6);
  near(metrics.modeledProfit, 5000, 1e-6);
  assert.equal(metrics.paybackMonths, 6);
  assert.equal(metrics.exitLabel, 'Projected sale proceeds');
});

test('purchase cash-to-close uses loan points on loan amount (not purchase price)', () => {
  const result = calculateDeal(defaultDealInput);

  const p = defaultDealInput.purchase;
  const loanAmount = p.purchasePrice * (1 - p.downPaymentPercent);
  const expected =
    p.purchasePrice * p.downPaymentPercent +
    p.purchasePrice * p.closingCostPercent +
    loanAmount * p.pointsPercent +
    p.rehabBudget;

  near(result.purchase.totalCashNeeded, expected);
});

test('master summary cash-to-close excludes rehab and one-time setup costs', () => {
  const result = calculateDeal(defaultDealInput);
  const p = defaultDealInput.purchase;
  const loanAmount = p.purchasePrice * (1 - p.downPaymentPercent);
  const expectedCashToClose =
    p.purchasePrice * p.downPaymentPercent +
    p.purchasePrice * p.closingCostPercent +
    loanAmount * p.pointsPercent +
    p.helocClosingCosts;

  near(result.masterSummary.cashToClose, expectedCashToClose);
});

test('commercial strategy uses leased sq ft and $/sq ft assumptions for NOI and cash flow', () => {
  const model = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      purchasePrice: 1000000,
      arv: 1200000,
      downPaymentPercent: 0.25,
      interestRate: 0.07,
      loanTermYears: 25
    },
    commercial: {
      ...defaultDealInput.commercial,
      grossLeasableAreaSqft: 12000,
      occupiedSqft: 10200,
      averageBaseRentPerSqftYear: 24,
      nnnRecoveryPerSqftYear: 8,
      vacancyPercent: 0.05,
      creditLossPercent: 0.01,
      nonRecoverableExpensesPerSqftYear: 4.5,
      managementFeePercent: 0.03,
      tenantImprovementsReservePerSqftYear: 0.9,
      leasingCommissionsReservePerSqftYear: 0.75
    }
  };

  const result = calculateDeal(model);
  const c = model.commercial;
  const occupiedSqft = Math.min(c.occupiedSqft, c.grossLeasableAreaSqft);
  const grossRevenueMonthly = (occupiedSqft * c.averageBaseRentPerSqftYear + occupiedSqft * c.nnnRecoveryPerSqftYear) / 12;
  const vacancyLossMonthly = grossRevenueMonthly * c.vacancyPercent;
  const creditLossMonthly = grossRevenueMonthly * c.creditLossPercent;
  const effectiveGrossMonthly = grossRevenueMonthly - vacancyLossMonthly - creditLossMonthly;
  const managementFeeMonthly = effectiveGrossMonthly * c.managementFeePercent;
  const nonRecoverableMonthly = (c.grossLeasableAreaSqft * c.nonRecoverableExpensesPerSqftYear) / 12;
  const tiReserveMonthly = (c.grossLeasableAreaSqft * c.tenantImprovementsReservePerSqftYear) / 12;
  const leasingReserveMonthly = (c.grossLeasableAreaSqft * c.leasingCommissionsReservePerSqftYear) / 12;
  const noi =
    effectiveGrossMonthly -
    managementFeeMonthly -
    nonRecoverableMonthly -
    tiReserveMonthly -
    leasingReserveMonthly -
    fixedCostsMonthly(model);
  const debt = calculateMonthlyPayment(calculateLoanAmount(model.purchase.purchasePrice, model.purchase.downPaymentPercent), model.purchase.interestRate, model.purchase.loanTermYears);

  near(result.purchase.noiMonthly ?? 0, noi, 0.01);
  near(result.purchase.monthlyCashFlow, noi - debt, 0.01);
  near(result.purchase.monthlyCashFlowExcludingReserves ?? 0, noi - debt + tiReserveMonthly + leasingReserveMonthly, 0.01);
  assert.ok(result.purchase.calculationBreakdown?.lines.some((line) => line.key === 'comm-base-rent'));
});

test('commercial strategy includes variable expenses when the commercial toggle is enabled', () => {
  const model = {
    ...defaultDealInput,
    variableExpenses: defaultDealInput.variableExpenses.map((expense) =>
      expense.key === 'power'
        ? {
            ...expense,
            monthlyAmount: 240,
            appliesTo: { ...expense.appliesTo, purchase: true }
          }
        : expense
    )
  };

  const baseResult = calculateDeal(defaultDealInput).purchase;
  const result = calculateDeal(model).purchase;

  near(baseResult.monthlyCashFlow - result.monthlyCashFlow, 240, 0.01);
  assert.ok(result.calculationBreakdown?.lines.some((line) => line.key === 'comm-variable-expenses'));
});

test('long-term module includes base fixed and variable expenses', () => {
  const result = calculateDeal(defaultDealInput);
  const p = defaultDealInput.purchase;
  const lt = defaultDealInput.longTerm;

  const gross = lt.grossRentMonthly + lt.otherIncomeMonthly;
  const effectiveGrossIncome = gross * (1 - lt.vacancyPercent);
  const noi =
    effectiveGrossIncome -
    effectiveGrossIncome * lt.maintenancePercent -
    effectiveGrossIncome * lt.capexPercent -
    effectiveGrossIncome * lt.managementFeePercent -
    lt.ownerExpensesMonthly -
    fixedCostsMonthly() -
    variableCostMonthly('longTerm');
  const debt = calculateMonthlyPayment(calculateLoanAmount(p.purchasePrice, p.downPaymentPercent), p.interestRate, p.loanTermYears);
  const expectedMonthly = noi - debt;

  near(result.longTerm.noiMonthly ?? 0, noi);
  near(result.longTerm.monthlyCashFlow, expectedMonthly);
});

test('long-term tenant placement fee appears in show-work only and does not change KPIs', () => {
  const model = {
    ...defaultDealInput,
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 2400,
      otherIncomeMonthly: 150,
      tenantPlacementFeePercent: 0.75
    }
  };

  const result = calculateDeal(model);
  const p = model.purchase;
  const lt = model.longTerm;
  const gross = lt.grossRentMonthly + lt.otherIncomeMonthly;
  const effectiveGrossIncome = gross * (1 - lt.vacancyPercent);
  const noi =
    effectiveGrossIncome -
    effectiveGrossIncome * lt.maintenancePercent -
    effectiveGrossIncome * lt.capexPercent -
    effectiveGrossIncome * lt.managementFeePercent -
    lt.ownerExpensesMonthly -
    fixedCostsMonthly(model) -
    variableCostMonthly('longTerm', model);
  const debt = calculateMonthlyPayment(calculateLoanAmount(p.purchasePrice, p.downPaymentPercent), p.interestRate, p.loanTermYears);

  near(result.longTerm.noiMonthly ?? 0, noi, 0.01);
  near(result.longTerm.monthlyCashFlow, noi - debt, 0.01);

  const placementLine = result.longTerm.calculationBreakdown?.lines.find((line) => line.key === 'lt-tenant-placement-fyi');
  assert.ok(placementLine);
  near(placementLine?.monthly ?? 0, 0, 0.0001);
  near(placementLine?.annual ?? 0, -(lt.grossRentMonthly * lt.tenantPlacementFeePercent), 0.01);
});

test('long-term turnaround mode computes stabilized outputs and show-work lines', () => {
  const model = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      purchasePrice: 640000,
      downPaymentPercent: 0.2,
      interestRate: 0.072,
      loanTermYears: 30
    },
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 2600,
      otherIncomeMonthly: 100,
      turnaround: {
        ...defaultDealInput.longTerm.turnaround,
        enabled: true,
        stabilizedGrossRentMonthly: 7200,
        stabilizedOtherIncomeMonthly: 250,
        laundryIncomeMonthly: 180,
        vendingMiscIncomeMonthly: 90,
        garageIncomeMonthly: 140,
        parkingIncomeMonthly: 220,
        additionalIncomeMonthly: 120,
        rehabBudgetForStabilization: 185000,
        annualTaxInsuranceAdjustment: 2400,
        vacancyPercent: 0.03,
        maintenancePercent: 0.05,
        capexPercent: 0.02,
        ownerPaidExpensesMonthly: 550,
        managementFeePercent: 0.06,
        exitRefiCapRatePercent: 0.055
      }
    }
  };

  const result = calculateDeal(model);
  const summary = result.longTerm.longTermTurnaroundSummary;

  assert.ok(summary?.enabled);

  const stabilizedGrossIncome =
    model.longTerm.turnaround.stabilizedGrossRentMonthly +
    model.longTerm.turnaround.stabilizedOtherIncomeMonthly +
    model.longTerm.turnaround.laundryIncomeMonthly +
    model.longTerm.turnaround.vendingMiscIncomeMonthly +
    model.longTerm.turnaround.garageIncomeMonthly +
    model.longTerm.turnaround.parkingIncomeMonthly +
    model.longTerm.turnaround.additionalIncomeMonthly;
  const vacancyLoss = stabilizedGrossIncome * model.longTerm.turnaround.vacancyPercent;
  const effectiveGrossIncome = stabilizedGrossIncome - vacancyLoss;
  const operatingExpenses =
    effectiveGrossIncome * model.longTerm.turnaround.maintenancePercent +
    effectiveGrossIncome * model.longTerm.turnaround.capexPercent +
    effectiveGrossIncome * model.longTerm.turnaround.managementFeePercent +
    model.longTerm.turnaround.ownerPaidExpensesMonthly +
    (fixedCostsMonthly(model) + model.longTerm.turnaround.annualTaxInsuranceAdjustment / 12) +
    variableCostMonthly('longTerm', model);
  const stabilizedNoi = effectiveGrossIncome - operatingExpenses;
  const debt = calculateMonthlyPayment(
    calculateLoanAmount(model.purchase.purchasePrice, model.purchase.downPaymentPercent),
    model.purchase.interestRate,
    model.purchase.loanTermYears
  );

  near(summary?.stabilizedGrossIncomeMonthly ?? 0, stabilizedGrossIncome, 0.01);
  near(summary?.effectiveGrossIncomeMonthly ?? 0, effectiveGrossIncome, 0.01);
  near(summary?.noiMonthly ?? 0, stabilizedNoi, 0.01);
  near(summary?.cashFlowPreTaxMonthly ?? 0, stabilizedNoi - debt, 0.01);
  near(summary?.totalCashInvested ?? 0, result.purchase.totalCashNeeded + model.longTerm.turnaround.rehabBudgetForStabilization, 0.01);
  near(summary?.impliedValueAtExitCap ?? 0, (stabilizedNoi * 12) / model.longTerm.turnaround.exitRefiCapRatePercent, 0.01);
  assert.ok(result.longTerm.calculationBreakdown?.lines.some((line) => line.key === 'lt-stab-noi'));
});


test('owned mode uses entered mortgage payment for debt service even when payoff inputs imply a higher payment', () => {
  const model = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      ownershipMode: 'owned' as const,
      existingMortgageMonthly: 1650,
      existingMortgageBalance: 240000,
      existingMortgageRate: 0.0825,
      existingMortgageRemainingYears: 15,
      existingTaxMonthly: 420,
      existingInsuranceMonthly: 180,
      financingType: 'cash' as const,
      purchasePrice: 0,
      downPaymentPercent: 1,
      interestRate: 0,
      propertyTaxAnnualOverride: null,
      insuranceAnnualOverride: null
    },
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 3000
    }
  };

  const result = calculateDeal(model);
  const impliedAmortizedPayment = calculateMonthlyPayment(
    model.purchase.existingMortgageBalance,
    model.purchase.existingMortgageRate,
    model.purchase.existingMortgageRemainingYears
  );
  const expectedDebtService = model.purchase.existingMortgageMonthly;

  assert.ok(impliedAmortizedPayment > expectedDebtService);
  near(result.purchase.totalCashNeeded, 0);
  near(result.longTerm.calculationBreakdown?.debtServiceMonthly ?? 0, expectedDebtService);
  near(result.purchase.calculationBreakdown?.debtServiceMonthly ?? 0, expectedDebtService);
  near(result.longTerm.monthlyCashFlow, (result.longTerm.noiMonthly ?? 0) - expectedDebtService, 0.01);
  const fixedLine = result.longTerm.calculationBreakdown?.lines.find((line) => line.key === 'lt-fixed-costs');

  near(Math.abs(fixedLine?.monthly ?? 0), fixedCostsMonthly(model), 0.1);
});

test('owned mode projections use entered mortgage payment for cash flow and payoff inputs for sale proceeds', () => {
  const model = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      ownershipMode: 'owned' as const,
      financingType: 'cash' as const,
      purchasePrice: 0,
      existingMortgageMonthly: 1450,
      existingMortgageBalance: 210000,
      existingMortgageRate: 0.0675,
      existingMortgageRemainingYears: 22,
      arv: 335000
    },
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 3100
    }
  };

  const result = calculateDeal(model);
  const yearOneOperatingCashFlow = result.longTerm.cashFlowTimeline[1];
  const expectedYearOneOperatingCashFlow = ((result.longTerm.noiMonthly ?? 0) - model.purchase.existingMortgageMonthly) * 12;
  const remainingPrimaryBalance = calculateRemainingBalance(
    model.purchase.existingMortgageBalance,
    model.purchase.existingMortgageRate,
    model.purchase.existingMortgageRemainingYears,
    model.assumptions.holdYears,
    'PI'
  );
  const expectedSaleProceeds =
    model.purchase.arv * Math.pow(1 + model.assumptions.annualAppreciationPercent, model.assumptions.holdYears) * (1 - model.assumptions.sellingCostPercent) -
    remainingPrimaryBalance;

  near(yearOneOperatingCashFlow, expectedYearOneOperatingCashFlow, 0.01);
  near(result.longTerm.saleProceeds ?? 0, expectedSaleProceeds, 0.1);
});

test('owned mode does not infer debt service from payoff inputs when monthly payment is blank', () => {
  const model = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      ownershipMode: 'owned' as const,
      financingType: 'cash' as const,
      purchasePrice: 0,
      existingMortgageMonthly: 0,
      existingMortgageBalance: 180000,
      existingMortgageRate: 0.071,
      existingMortgageRemainingYears: 20
    }
  };

  const result = calculateDeal(model);

  near(result.longTerm.calculationBreakdown?.debtServiceMonthly ?? 0, 0, 0.0001);
  near(result.longTerm.monthlyCashFlow, result.longTerm.noiMonthly ?? 0, 0.01);
  near(result.longTerm.cashFlowTimeline[1], (result.longTerm.noiMonthly ?? 0) * 12, 0.01);
});

test('owned mode uses explicit capital inputs for total invested and projection basis', () => {
  const model = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      ownershipMode: 'owned' as const,
      financingType: 'cash' as const,
      purchasePrice: 0,
      arv: 0,
      ownedPurchasePrice: 265000,
      ownedMoneyDown: 53000,
      ownedAdditionalInvested: 18500,
      helocClosingCosts: 2500,
      existingMortgageMonthly: 1425,
      existingMortgageBalance: 176000,
      existingMortgageRate: 0.061,
      existingMortgageRemainingYears: 24,
      existingTaxMonthly: 260,
      existingInsuranceMonthly: 110
    },
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 2950
    }
  };

  const result = calculateDeal(model);
  const expectedInvestedCapital =
    model.purchase.ownedMoneyDown + model.purchase.ownedAdditionalInvested + model.purchase.helocClosingCosts;

  near(result.purchase.totalCashNeeded, expectedInvestedCapital, 0.01);
  near(result.longTerm.totalCashNeeded, expectedInvestedCapital, 0.01);
  near(result.longTerm.cashOnCashReturn, result.longTerm.annualCashFlow / expectedInvestedCapital, 1e-9);
  near(result.longTerm.cashFlowTimeline[0], -expectedInvestedCapital, 0.01);
});

test('owned mode uses original purchase price for cap rate and sale basis when current purchase price is blank', () => {
  const model = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      ownershipMode: 'owned' as const,
      financingType: 'cash' as const,
      purchasePrice: 0,
      arv: 0,
      ownedPurchasePrice: 250000,
      ownedMoneyDown: 50000,
      ownedAdditionalInvested: 15000,
      existingMortgageMonthly: 1200,
      existingMortgageBalance: 160000,
      existingMortgageRate: 0.058,
      existingMortgageRemainingYears: 20
    },
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 2800
    },
    assumptions: {
      ...defaultDealInput.assumptions,
      annualAppreciationPercent: 0,
      sellingCostPercent: 0.06
    }
  };

  const result = calculateDeal(model);
  const expectedCapRate = ((result.longTerm.noiMonthly ?? 0) * 12) / model.purchase.ownedPurchasePrice;
  const remainingPrimaryBalance = calculateRemainingBalance(
    model.purchase.existingMortgageBalance,
    model.purchase.existingMortgageRate,
    model.purchase.existingMortgageRemainingYears,
    model.assumptions.holdYears,
    'PI'
  );
  const expectedSaleProceeds = model.purchase.ownedPurchasePrice * (1 - model.assumptions.sellingCostPercent) - remainingPrimaryBalance;

  near(result.longTerm.capRate, expectedCapRate, 1e-9);
  near(result.longTerm.saleProceeds ?? 0, expectedSaleProceeds, 0.1);
});

test('purchase taxes and insurance are auto calculated but can be overridden', () => {
  const model = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      propertyTaxAnnualOverride: 12000,
      insuranceAnnualOverride: 9000
    }
  };

  const result = calculateDeal(model);
  const fixed = fixedCostsMonthly(model);
  const autoFixed = fixedCostsMonthly(defaultDealInput);

  assert.ok(fixed !== autoFixed);
  assert.ok(result.longTerm.monthlyCashFlow < calculateDeal(defaultDealInput).longTerm.monthlyCashFlow);
});

test('flip monthly cash flow is zero and net proceeds are realized at exit', () => {
  const result = calculateDeal(defaultDealInput);

  near(result.flip.monthlyCashFlow, 0);
  assert.ok((result.flip.saleProceeds ?? 0) !== 0);
});

test('long-term timeline covers Year 0..N and produces irr from cashflows', () => {
  const result = calculateDeal(defaultDealInput);
  const holdYears = defaultDealInput.assumptions.holdYears;

  assert.equal(result.longTerm.cashFlowTimeline.length, holdYears + 1);
  assert.ok(result.longTerm.cashFlowTimeline[0] < 0);
  assert.ok(Number.isFinite(result.longTerm.irr));
});


test('flip IRR timeline exits at full terminal cash flow, not net profit only', () => {
  const result = calculateDeal(defaultDealInput);
  const { purchase: p, flip: f } = defaultDealInput;

  const fixed = fixedCostsMonthly();
  const variable = variableCostMonthly('flip');
  const debtService = calculateMonthlyPayment(calculateLoanAmount(p.purchasePrice, p.downPaymentPercent), p.interestRate, p.loanTermYears);
  const holdingCosts = f.holdingMonths * (fixed + variable + debtService);
  const totalCashInvested = result.purchase.totalCashNeeded + holdingCosts;

  const netProfit =
    p.arv -
    p.purchasePrice -
    p.rehabBudget -
    p.purchasePrice * p.closingCostPercent -
    p.arv * f.agentCommissionPercent -
    p.arv * f.sellClosingCostPercent -
    f.sellerConcessions -
    holdingCosts;

  near(result.flip.cashFlowTimeline[0], -Math.abs(totalCashInvested));
  near(result.flip.cashFlowTimeline[1], totalCashInvested + netProfit);
  assert.notEqual(result.flip.cashFlowTimeline[1], netProfit);
});

test('brrrr timeline nets refinance into year-0 capital, with no year-1 cash-back bump', () => {
  const model = {
    ...defaultDealInput,
    brrrr: {
      ...defaultDealInput.brrrr,
      arvOverride: defaultDealInput.purchase.arv
    }
  };
  const result = calculateDeal(model);
  const { purchase: p, brrrr } = model;

  const strategyVariableCosts = variableCostMonthly('longTerm');
  const acquisitionDebtService = calculateMonthlyPayment(calculateLoanAmount(p.purchasePrice, p.downPaymentPercent), p.interestRate, p.loanTermYears);
  const holdingCosts = brrrr.holdingMonths * (brrrr.holdingExpensesMonthly + fixedCostsMonthly() + strategyVariableCosts + acquisitionDebtService);
  const investedAtPurchase = result.purchase.totalCashNeeded + holdingCosts;

  const refiLoanAmount = p.arv * brrrr.refinanceLtvPercent;
  const refiClosingCosts = refiLoanAmount * brrrr.refinanceClosingCostPercent;
  const initialLoan = calculateLoanAmount(p.purchasePrice, p.downPaymentPercent);
  const cashBackAtRefiNet = refiLoanAmount - refiClosingCosts - initialLoan;
  const investedAfterRefi = investedAtPurchase - cashBackAtRefiNet;

  near(result.brrrr.cashFlowTimeline[0], -Math.abs(investedAfterRefi));
  assert.ok(result.brrrr.cashFlowTimeline.length >= 2);

  near(result.brrrr.cashFlowTimeline[1], result.brrrr.annualCashFlow, 0.01);
});



test('hold strategy ROI/IRR summary metrics come from the Excel parity timeline output', () => {
  const result = calculateDeal(defaultDealInput);

  for (const strategy of [result.longTerm, result.airbnb, result.padSplit, result.brrrr]) {
    near(strategy.roi, calcTotalRoiFromTimeline(strategy.cashFlowTimeline), 1e-6);
  }
});

test('long-term CoC, ROI, and DSCR align with underwriting formulas', () => {
  const result = calculateDeal(defaultDealInput);
  const p = defaultDealInput.purchase;
  const lt = defaultDealInput.longTerm;

  const gross = lt.grossRentMonthly + lt.otherIncomeMonthly;
  const effectiveGrossIncome = gross * (1 - lt.vacancyPercent);
  const noi =
    effectiveGrossIncome -
    effectiveGrossIncome * lt.maintenancePercent -
    effectiveGrossIncome * lt.capexPercent -
    effectiveGrossIncome * lt.managementFeePercent -
    lt.ownerExpensesMonthly -
    fixedCostsMonthly() -
    variableCostMonthly('longTerm');

  const debt = calculateMonthlyPayment(calculateLoanAmount(p.purchasePrice, p.downPaymentPercent), p.interestRate, p.loanTermYears);
  const monthly = noi - debt;
  const annual = monthly * 12;
  const expectedCoc = annual / result.purchase.totalCashNeeded;
  const expectedRoi = calcTotalRoiFromTimeline(result.longTerm.cashFlowTimeline);
  const expectedDscr = noi / debt;

  near(result.longTerm.cashOnCashReturn, expectedCoc, 0.0001);
  near(result.longTerm.roi, expectedRoi, 0.0001);
  near(result.longTerm.dscr, expectedDscr, 0.0001);
});


test('IO payment uses simple interest and remaining balance does not amortize', () => {
  const principal = 220000;
  const rate = 0.09;
  const ioPayment = calculateInterestOnlyPayment(principal, rate);

  near(ioPayment, (principal * rate) / 12, 0.0001);
  near(calculateRemainingBalance(principal, rate, 30, 5, 'IO'), principal, 0.0001);
});

test('HELOC debt service is included in operating monthly cash flow', () => {
  const model = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      financingType: 'cash' as const,
      helocAmount: 180000,
      helocRate: 0.1,
      helocAmortizationType: 'IO' as const
    }
  };

  const result = calculateDeal(model);
  const gross = model.longTerm.grossRentMonthly + model.longTerm.otherIncomeMonthly;
  const effectiveGrossIncome = gross * (1 - model.longTerm.vacancyPercent);
  const noi =
    effectiveGrossIncome -
    effectiveGrossIncome * model.longTerm.maintenancePercent -
    effectiveGrossIncome * model.longTerm.capexPercent -
    effectiveGrossIncome * model.longTerm.managementFeePercent -
    model.longTerm.ownerExpensesMonthly -
    fixedCostsMonthly(model) -
    variableCostMonthly('longTerm', model);
  const helocDebt = (model.purchase.helocAmount * model.purchase.helocRate) / 12;

  near(result.longTerm.monthlyCashFlow, noi - helocDebt);
});

test('sale proceeds appreciation base uses ARV when provided', () => {
  const common = {
    appreciation: 0.04,
    sellingCost: 0.08,
    balance: 100000,
    years: 5
  };

  const withArv = estimateSaleProceeds(250000, 350000, common.appreciation, common.sellingCost, common.balance, common.years);
  const withPurchaseBase = estimateSaleProceeds(250000, 0, common.appreciation, common.sellingCost, common.balance, common.years);

  const expectedArv = 350000 * Math.pow(1 + common.appreciation, common.years);
  const expectedPurchase = 250000 * Math.pow(1 + common.appreciation, common.years);

  near(withArv, expectedArv - expectedArv * common.sellingCost - common.balance, 0.0001);
  near(withPurchaseBase, expectedPurchase - expectedPurchase * common.sellingCost - common.balance, 0.0001);
});

test('BRRRR cash back uses payoff of initial acquisition debt', () => {
  const model = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      financingType: 'loan' as const,
      amortizationType: 'PI' as const,
      purchasePrice: 300000,
      rehabBudget: 40000,
      downPaymentPercent: 0.2,
      interestRate: 0.08,
      loanTermYears: 30,
      arv: 420000
    },
    brrrr: {
      ...defaultDealInput.brrrr,
      arvOverride: 420000,
      holdingMonths: 6,
      refinanceLtvPercent: 0.75,
      refinanceClosingCostPercent: 0.02
    }
  };

  const result = calculateDeal(model);
  const initialLoan = calculateLoanAmount(model.purchase.purchasePrice, model.purchase.downPaymentPercent);
  const refiLoanAmount = (model.brrrr.arvOverride ?? 0) * model.brrrr.refinanceLtvPercent;
  const expectedCashBack = refiLoanAmount - refiLoanAmount * model.brrrr.refinanceClosingCostPercent - initialLoan;

  const strategyVariableCosts = variableCostMonthly('longTerm', model);
  const fixed = fixedCostsMonthly(model);
  const acquisitionDebtService = calculateMonthlyPayment(initialLoan, model.purchase.interestRate, model.purchase.loanTermYears);
  const investedAtPurchase = result.purchase.totalCashNeeded + model.brrrr.holdingMonths * (model.brrrr.holdingExpensesMonthly + fixed + strategyVariableCosts + acquisitionDebtService);

  near(result.brrrr.cashFlowTimeline[0], -Math.abs(investedAtPurchase - expectedCashBack), 0.01);
});


test('HELOC supplemental amount reduces out-of-pocket cash-to-close', () => {
  const model = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      financingType: 'loan' as const,
      helocAmount: 20000,
      helocClosingCosts: 1200
    }
  };

  const baseline = calculateDeal(defaultDealInput).purchase.totalCashNeeded;
  const adjusted = calculateDeal(model).purchase.totalCashNeeded;

  near(adjusted, Math.max(baseline - 20000, 0) + 1200);
});

test('long-term annual revenue override takes precedence over monthly rent and other income inputs', () => {
  const base = {
    ...defaultDealInput,
    longTerm: {
      ...defaultDealInput.longTerm,
      annualRevenueOverride: 60000,
      grossRentMonthly: 1200,
      otherIncomeMonthly: 100
    }
  };

  const changedInputs = {
    ...base,
    longTerm: {
      ...base.longTerm,
      grossRentMonthly: 4800,
      otherIncomeMonthly: 900
    }
  };

  const baseResult = calculateDeal(base).longTerm;
  const changedResult = calculateDeal(changedInputs).longTerm;

  near(baseResult.noiMonthly ?? 0, changedResult.noiMonthly ?? 0, 0.0001);
});


test('STR includes management fee, reserves, and furnishing in invested capital', () => {
  const model = {
    ...defaultDealInput,
    airbnb: {
      ...defaultDealInput.airbnb,
      maintenancePercent: 0.05,
      capexPercent: 0.05,
      managementFeePercent: 0.2,
      furnishingOneTime: 25000
    }
  };

  const result = calculateDeal(model);
  const airbnb = model.airbnb;
  const occupiedNights = airbnb.nightsPerMonth * airbnb.occupancyPercent;
  const bookings = occupiedNights / Math.max(airbnb.averageNightsPerBooking, 1);
  const roomRevenue = occupiedNights * airbnb.adr;
  const gross = roomRevenue + bookings * airbnb.cleaningFeeCharged;
  const noi =
    gross -
    roomRevenue * airbnb.platformFeePercent -
    bookings * airbnb.cleanerCostPerTurn -
    roomRevenue * airbnb.maintenancePercent -
    roomRevenue * airbnb.capexPercent -
    roomRevenue * airbnb.managementFeePercent -
    airbnb.ownerExpensesMonthly -
    fixedCostsMonthly(model) -
    variableCostMonthly('airbnb', model);

  near(result.airbnb.noiMonthly ?? 0, noi, 0.01);
  near(result.airbnb.totalCashNeeded, result.purchase.totalCashNeeded + airbnb.furnishingOneTime, 0.01);
});

test('STR cleaning revenue does not increase platform, management, maintenance, or capex drag', () => {
  const model = {
    ...defaultDealInput,
    airbnb: {
      ...defaultDealInput.airbnb,
      cleaningFeeCharged: 500
    }
  };

  const result = calculateDeal(model);
  const lines = result.airbnb.calculationBreakdown?.lines ?? [];
  const platformLine = lines.find((line) => line.key === 'str-platform-fees');
  const managementLine = lines.find((line) => line.key === 'str-management');
  const maintenanceLine = lines.find((line) => line.key === 'str-maintenance');
  const capexLine = lines.find((line) => line.key === 'str-capex');

  const airbnb = model.airbnb;
  const occupiedNights = airbnb.nightsPerMonth * airbnb.occupancyPercent;
  const roomRevenue = occupiedNights * airbnb.adr;

  near(Math.abs(platformLine?.monthly ?? 0), roomRevenue * airbnb.platformFeePercent, 0.0001);
  near(Math.abs(managementLine?.monthly ?? 0), roomRevenue * airbnb.managementFeePercent, 0.0001);
  near(Math.abs(maintenanceLine?.monthly ?? 0), roomRevenue * airbnb.maintenancePercent, 0.0001);
  near(Math.abs(capexLine?.monthly ?? 0), roomRevenue * airbnb.capexPercent, 0.0001);
});

test('STR annual revenue override ignores ADR and cleaning-fee inputs for revenue modeling', () => {
  const base = {
    ...defaultDealInput,
    airbnb: {
      ...defaultDealInput.airbnb,
      annualRevenueOverride: 120000,
      adr: 150,
      cleaningFeeCharged: 80
    }
  };

  const changedInputs = {
    ...base,
    airbnb: {
      ...base.airbnb,
      adr: 420,
      cleaningFeeCharged: 260
    }
  };

  const baseResult = calculateDeal(base).airbnb;
  const changedResult = calculateDeal(changedInputs).airbnb;

  near(baseResult.noiMonthly ?? 0, changedResult.noiMonthly ?? 0, 0.0001);
});

test('PadSplit includes other income plus reserve and management fee percentages', () => {
  const model = {
    ...defaultDealInput,
    padSplit: {
      ...defaultDealInput.padSplit,
      otherIncomeMonthly: 300,
      maintenancePercent: 0.03,
      capexPercent: 0.04,
      managementFeePercent: 0.1
    }
  };

  const result = calculateDeal(model);
  const ps = model.padSplit;
  const gross = ps.rentableRooms * ps.avgWeeklyRatePerRoom * ps.weeksPerMonth * ps.occupancyPercent + ps.otherIncomeMonthly;
  const noi =
    gross -
    gross * ps.platformFeePercent -
    gross * ps.maintenancePercent -
    gross * ps.capexPercent -
    gross * ps.managementFeePercent -
    (ps.turnoverCostPerMoveOut * ps.moveOutsPerYear * ps.rentableRooms) / 12 -
    (ps.moveOutsPerYear * ((ps.avgWeeklyRatePerRoom * 10) / 7)) / 12 -
    ps.ownerExpensesMonthly -
    fixedCostsMonthly(model) -
    variableCostMonthly('padSplit', model);

  near(result.padSplit.noiMonthly ?? 0, noi, 0.01);
});

test('PadSplit annual revenue override takes precedence over room-rent inputs', () => {
  const base = {
    ...defaultDealInput,
    padSplit: {
      ...defaultDealInput.padSplit,
      annualRevenueOverride: 96000,
      rentableRooms: 4,
      avgWeeklyRatePerRoom: 150,
      otherIncomeMonthly: 0
    }
  };

  const changedInputs = {
    ...base,
    padSplit: {
      ...base.padSplit,
      avgWeeklyRatePerRoom: 420,
      otherIncomeMonthly: 5000
    }
  };

  const baseResult = calculateDeal(base).padSplit;
  const changedResult = calculateDeal(changedInputs).padSplit;

  near(baseResult.noiMonthly ?? 0, changedResult.noiMonthly ?? 0, 0.0001);
});

test('PadSplit turnover and placement fees match spreadsheet formulas and are separate line items', () => {
  const model = {
    ...defaultDealInput,
    padSplit: {
      ...defaultDealInput.padSplit,
      rentableRooms: 7,
      avgWeeklyRatePerRoom: 195,
      moveOutsPerYear: 10,
      turnoverCostPerMoveOut: 40
    }
  };

  const result = calculateDeal(model);
  const lines = result.padSplit.calculationBreakdown?.lines ?? [];

  const turnoverLine = lines.find((line) => line.key === 'ps-turnover-cleaning');
  const placementLine = lines.find((line) => line.key === 'ps-tenant-placement');

  assert.ok(turnoverLine);
  assert.ok(placementLine);

  const expectedTurnoverMonthly = (40 * 10 * 7) / 12;
  const expectedPlacementMonthly = (10 * ((195 * 10) / 7)) / 12;

  near(Math.abs(turnoverLine?.monthly ?? 0), expectedTurnoverMonthly, 0.0001);
  near(Math.abs(turnoverLine?.annual ?? 0), expectedTurnoverMonthly * 12, 0.0001);
  near(Math.abs(placementLine?.monthly ?? 0), expectedPlacementMonthly, 0.0001);
  near(Math.abs(placementLine?.annual ?? 0), expectedPlacementMonthly * 12, 0.0001);
  near(Math.abs((turnoverLine?.monthly ?? 0) + (placementLine?.monthly ?? 0)), expectedTurnoverMonthly + expectedPlacementMonthly, 0.0001);
});



test('PadSplit furnishing costs are included in invested capital for CoC/ROI', () => {
  const result = calculateDeal(defaultDealInput);
  const purchaseCash = result.purchase.totalCashNeeded;
  const investedCapital = purchaseCash + defaultDealInput.padSplit.furnishingOneTime;

  near(result.padSplit.totalCashNeeded, investedCapital, 0.01);
  near(result.padSplit.cashOnCashReturn, result.padSplit.annualCashFlow / investedCapital, 0.0001);
  near(result.padSplit.roi, calcTotalRoiFromTimeline(result.padSplit.cashFlowTimeline), 0.0001);
});

test('BRRRR uses selected operating strategy NOI for post-refi operations', () => {
  const model = {
    ...defaultDealInput,
    brrrr: {
      ...defaultDealInput.brrrr,
      arvOverride: defaultDealInput.purchase.arv,
      operatingStrategy: 'airbnb' as const
    }
  };

  const result = calculateDeal(model);
  const refiDebt = calculateMonthlyPayment(
    (model.brrrr.arvOverride ?? 0) * model.brrrr.refinanceLtvPercent,
    model.brrrr.refinanceRate,
    model.purchase.loanTermYears
  );

  near(result.brrrr.noiMonthly ?? 0, result.airbnb.noiMonthly ?? 0, 0.01);
  near(result.brrrr.monthlyCashFlow, (result.airbnb.noiMonthly ?? 0) - refiDebt, 0.01);
});

test('HELOC PI amortization uses term-based monthly payment', () => {
  const model = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      financingType: 'cash' as const,
      helocAmount: 120000,
      helocRate: 0.0725,
      helocTermYears: 15,
      helocAmortizationType: 'PI' as const
    }
  };

  const result = calculateDeal(model);
  const gross = model.longTerm.grossRentMonthly + model.longTerm.otherIncomeMonthly;
  const effectiveGrossIncome = gross * (1 - model.longTerm.vacancyPercent);
  const noi =
    effectiveGrossIncome -
    effectiveGrossIncome * model.longTerm.maintenancePercent -
    effectiveGrossIncome * model.longTerm.capexPercent -
    effectiveGrossIncome * model.longTerm.managementFeePercent -
    model.longTerm.ownerExpensesMonthly -
    fixedCostsMonthly(model) -
    variableCostMonthly('longTerm', model);
  const helocDebt = calculateMonthlyPayment(model.purchase.helocAmount, model.purchase.helocRate, model.purchase.helocTermYears);

  near(result.longTerm.monthlyCashFlow, noi - helocDebt, 0.01);
});

test('strategy-level ARV override affects sale proceeds for hold strategies', () => {
  const baseline = calculateDeal(defaultDealInput);
  const model = {
    ...defaultDealInput,
    longTerm: {
      ...defaultDealInput.longTerm,
      arvOverride: 420000
    }
  };

  const overridden = calculateDeal(model);
  assert.ok((overridden.longTerm.saleProceeds ?? 0) > (baseline.longTerm.saleProceeds ?? 0));
});

test('BRRRR requires explicit BRRRR ARV before refinance math is applied', () => {
  const model = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      purchasePrice: 210000,
      arv: 210000,
      rehabBudget: 0,
      downPaymentPercent: 0.035,
      closingCostPercent: 0,
      interestRate: 0.0275,
      loanTermYears: 30,
      pointsPercent: 0
    },
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 1200,
      otherIncomeMonthly: 0,
      vacancyPercent: 0.05,
      maintenancePercent: 0.05,
      capexPercent: 0.05,
      managementFeePercent: 0.08,
      ownerExpensesMonthly: 0
    },
    variableExpenses: defaultDealInput.variableExpenses.map((expense) => ({
      ...expense,
      monthlyAmount: 0,
      appliesTo: { ...expense.appliesTo }
    })),
    brrrr: {
      ...defaultDealInput.brrrr,
      arvOverride: null,
      rehabOverride: 0,
      holdingMonths: 6,
      holdingExpensesMonthly: 0,
      refinanceRate: 0.065,
      refinanceClosingCostPercent: 0.03,
      operatingStrategy: 'longTerm' as const
    }
  };

  const result = calculateDeal(model);
  const expectedNoi = result.longTerm.noiMonthly ?? 0;
  const initialLoan = calculateLoanAmount(model.purchase.purchasePrice, model.purchase.downPaymentPercent);
  const acquisitionDebtService = calculateMonthlyPayment(initialLoan, model.purchase.interestRate, model.purchase.loanTermYears);
  const investedAtPurchase =
    result.purchase.totalCashNeeded +
    model.brrrr.holdingMonths * (model.brrrr.holdingExpensesMonthly + fixedCostsMonthly(model) + variableCostMonthly('longTerm', model) + acquisitionDebtService);

  near(result.brrrr.noiMonthly ?? 0, expectedNoi, 0.01);
  near(result.brrrr.monthlyCashFlow, expectedNoi, 0.01);
  near(result.brrrr.annualCashFlow, expectedNoi * 12, 0.01);
  near(result.brrrr.capRate, 0, 0.000001);
  near(result.brrrr.dscr, 0, 0.000001);
  near(result.brrrr.totalCashNeeded, investedAtPurchase + initialLoan, 0.01);
});

test('BRRRR rehab override changes BRRRR invested capital', () => {
  const baseModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      purchasePrice: 300000,
      rehabBudget: 40000,
      arv: 420000
    },
    brrrr: {
      ...defaultDealInput.brrrr,
      arvOverride: 420000
    }
  };

  const highRehab = calculateDeal({
    ...baseModel,
    brrrr: {
      ...baseModel.brrrr,
      rehabOverride: 90000
    }
  });

  const lowRehab = calculateDeal({
    ...baseModel,
    brrrr: {
      ...baseModel.brrrr,
      rehabOverride: 30000
    }
  });

  near(highRehab.brrrr.totalCashNeeded - lowRehab.brrrr.totalCashNeeded, 60000, 0.01);
  near(Math.abs(highRehab.brrrr.cashFlowTimeline[0]) - Math.abs(lowRehab.brrrr.cashFlowTimeline[0]), 60000, 0.01);
});

test('REI Calculator v2.15 parity fixture', () => {
  const fixture = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      purchasePrice: 405000,
      rehabBudget: 50000,
      arv: 445000,
      downPaymentPercent: 0.05,
      closingCostPercent: 0.01,
      pointsPercent: 0,
      interestRate: 0.0637,
      loanTermYears: 30
    },
    brrrr: {
      ...defaultDealInput.brrrr,
      arvOverride: 445000
    },
    assumptions: {
      ...defaultDealInput.assumptions,
      holdYears: 10,
      noiGrowthPercent: 0.025,
      annualAppreciationPercent: 0.04,
      sellingCostPercent: 0.08
    },
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 0,
      otherIncomeMonthly: 0,
      vacancyPercent: 0,
      maintenancePercent: 0,
      capexPercent: 0,
      managementFeePercent: 0,
      ownerExpensesMonthly: 0
    },
    airbnb: {
      ...defaultDealInput.airbnb,
      adr: 180,
      maintenancePercent: 0.04,
      capexPercent: 0.04,
      ownerExpensesMonthly: 675
    },
    padSplit: {
      ...defaultDealInput.padSplit,
      rentableRooms: 5,
      avgWeeklyRatePerRoom: 195,
      maintenancePercent: 0.04,
      capexPercent: 0.04,
      ownerExpensesMonthly: 820
    },
    variableExpenses: [
      { key: 'lt', label: 'LT', monthlyAmount: 300, appliesTo: { purchase: false, longTerm: true, airbnb: false, padSplit: false, flip: false } },
      { key: 'str', label: 'STR', monthlyAmount: 675, appliesTo: { purchase: false, longTerm: false, airbnb: true, padSplit: false, flip: false } },
      { key: 'ps', label: 'PS', monthlyAmount: 820, appliesTo: { purchase: false, longTerm: false, airbnb: false, padSplit: true, flip: false } }
    ]
  };

  const result = calculateDeal(fixture);

  near(result.longTerm.capRate, -0.03588888889, 1e-9);
  near(result.longTerm.cashOnCashReturn, -0.5830952405, 1e-9);
  near(result.longTerm.dscr, -0.5048807507, 1e-9);
  near(result.longTerm.irr, -0.1306043926, 1e-9);
  near(result.longTerm.roi, -3.285657625, 1e-9);

  near(result.airbnb.irr, -0.04822822475582286, 1e-9);
  near(result.airbnb.roi, -0.9668730042395492, 1e-9);

  near(result.padSplit.irr, -0.051673852668701885, 1e-9);
  near(result.padSplit.roi, -1.0535906071482806, 1e-9);

  near(result.brrrr.irr, -0.103474976, 1e-9);
  near(result.brrrr.roi, -1.5812330323, 1e-9);
});

test('Flip rehab override directly impacts net profit', () => {
  const baseModel = {
    ...defaultDealInput,
    flip: {
      ...defaultDealInput.flip,
      rehabOverride: 25000
    }
  };

  const expensiveRehab = calculateDeal({
    ...baseModel,
    flip: {
      ...baseModel.flip,
      rehabOverride: 60000
    }
  });

  const cheapRehab = calculateDeal(baseModel);
  assert.ok((expensiveRehab.flip.saleProceeds ?? 0) < (cheapRehab.flip.saleProceeds ?? 0));
});


test('scenario encode/decode preserves unicode payloads in server context', () => {
  const model = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      dealName: 'São Paulo Duplex 🏠',
      listingUrl: 'https://www.zillow.com/homedetails/123-Main-St-Tampa-FL-33602/12345_zpid/'
    }
  };
  const scenario = createScenarioRecord(model);
  const encoded = encodeScenario(scenario);
  const decoded = decodeScenario(encoded);

  assert.ok(decoded);
  assert.equal(decoded?.dealName, model.purchase.dealName);
  assert.equal(decoded?.payload.purchase.dealName, model.purchase.dealName);
});


test('pdf schema includes underwriting work, taxes/insurance, and variable expense detail', () => {
  const model = {
    ...defaultDealInput,
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 2400
    },
    variableExpenses: defaultDealInput.variableExpenses.map((expense) =>
      expense.key === 'power'
        ? { ...expense, appliesTo: { ...expense.appliesTo, longTerm: true }, monthlyAmount: 85 }
        : expense
    )
  };
  const result = calculateDeal(model);
  const report = createPdfReportSchema(model, result, 'longTerm');

  assert.ok(report.underwritingWork.rows.length > 0);
  assert.ok(report.taxAndInsuranceDetail.rows.some((row) => row.label === 'Property Tax'));
  assert.ok(report.taxAndInsuranceDetail.rows.some((row) => row.label === 'Insurance'));
  assert.ok(report.variableExpenseDetail.rows.some((row) => row.label === 'Total Variable Expenses'));

  assert.equal(report.listingReference.rows[0]?.label, 'Source URL');
  assert.equal(report.listingReference.rows[0]?.value, 'Not provided');
});


test('pdf schema emits clickable listing reference when listing URL exists', () => {
  const model = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      listingUrl: 'https://www.zillow.com/homedetails/123-Main-St-Tampa-FL-33602/12345_zpid/'
    }
  };
  const result = calculateDeal(model);
  const report = createPdfReportSchema(model, result, 'longTerm');

  assert.equal(report.listingReference.rows[0]?.href, model.purchase.listingUrl);
});
