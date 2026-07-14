import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateDeal } from '../lib/engine/deal-engine';
import { calculateCashToClose, calculateInterestOnlyPayment, calculateLoanAmount, calculateMonthlyPayment } from '../lib/engine/finance';
import { calcTotalRoiFromTimeline, calculateIrr, calculateRemainingBalance } from '../lib/engine/investment-math';
import { createPdfReportSchema } from '../lib/export/pdf-schema';
import { defaultDealInput, type DealInputModel } from '../lib/models/deal';
import { getModeledSaleCashAtMonth, getProjectionMetrics } from '../lib/projection-metrics';

const near = (actual: number, expected: number, epsilon = 0.01) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `Expected ${actual} to be within ${epsilon} of ${expected}`);
};

const withoutVariableExpenses = defaultDealInput.variableExpenses.map((expense) => ({
  ...expense,
  monthlyAmount: 0
}));

const zeroOperatingModel = () => ({
  ...defaultDealInput,
  purchase: {
    ...defaultDealInput.purchase,
    financingType: 'cash' as const,
    purchasePrice: 100000,
    arv: 100000,
    downPaymentPercent: 1,
    closingCostPercent: 0,
    pointsPercent: 0,
    rehabBudget: 0,
    propertyTaxAnnualOverride: 0,
    insuranceAnnualOverride: 0,
    hoaMonthly: 0,
    pmiMonthly: 0
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
  variableExpenses: withoutVariableExpenses,
  assumptions: {
    ...defaultDealInput.assumptions,
    annualAppreciationPercent: 0,
    noiGrowthPercent: 0,
    sellingCostPercent: 0
  }
});

const brrrrEventModel = (holdingExpensesMonthly: number): DealInputModel => {
  const base = zeroOperatingModel();
  return {
    ...base,
    assumptions: { ...base.assumptions, holdYears: 2 },
    brrrr: {
      ...base.brrrr,
      arvOverride: 100000,
      rehabOverride: 0,
      holdingMonths: 6,
      holdingExpensesMonthly,
      refinanceLtvPercent: 0.8,
      refinanceRate: 0,
      refinanceTermYears: 30,
      refinanceClosingCostPercent: 0,
      operatingStrategy: 'longTerm'
    }
  };
};

test('fixed-rate payment and remaining balance match independent amortization formulas', () => {
  const principal = 240000;
  const annualRate = 0.065;
  const termYears = 30;
  const elapsedYears = 5;
  const monthlyRate = annualRate / 12;
  const periods = termYears * 12;
  const elapsedPeriods = elapsedYears * 12;
  const factor = (1 + monthlyRate) ** periods;
  const expectedPayment = (principal * monthlyRate * factor) / (factor - 1);
  const expectedBalance = principal * (1 + monthlyRate) ** elapsedPeriods - expectedPayment * (((1 + monthlyRate) ** elapsedPeriods - 1) / monthlyRate);

  near(calculateMonthlyPayment(principal, annualRate, termYears), expectedPayment, 1e-8);
  near(calculateRemainingBalance(principal, annualRate, termYears, elapsedYears), expectedBalance, 1e-6);
});

test('debt balances and payments handle maturity and invalid negative inputs safely', () => {
  near(calculateRemainingBalance(100000, 0.08, 1, 1, 'IO'), 0);
  near(calculateRemainingBalance(100000, -0.08, 30, 1), 96666.66666666667, 0.01);
  near(calculateInterestOnlyPayment(-100000, -0.08), 0);
});

test('timeline ROI and conventional IRR match independent cash-flow math', () => {
  near(calcTotalRoiFromTimeline([-100000, 10000, 121000]), 0.31, 1e-10);
  near(calcTotalRoiFromTimeline([-100000, -20000, 150000]), 0.25, 1e-10);
  near(calcTotalRoiFromTimeline([100000, -20000]), 0);
  near(calcTotalRoiFromTimeline([0, 10000]), 0);
  near(calcTotalRoiFromTimeline([0, -1000, 10000]), 9, 1e-10);
  near(calculateIrr([-100, 0, 121]), 0.1, 1e-8);
  near(calculateIrr([-100, -10]), 0);
  near(calculateIrr([100, 10]), 0);
});

test('IRR supports valid annual returns above 1,000 percent', () => {
  near(calculateIrr([-1, 20]), 19, 1e-8);
});

test('BRRRR refinance cash back pays off every acquisition debt at its amortized balance', () => {
  const input = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      purchasePrice: 200000,
      rehabBudget: 50000,
      arv: 320000,
      downPaymentPercent: 0.2,
      interestRate: 0.06,
      loanTermYears: 30,
      closingCostPercent: 0,
      pointsPercent: 0,
      helocAmount: 20000,
      helocRate: 0.1,
      helocTermYears: 10,
      helocAmortizationType: 'PI' as const,
      helocClosingCosts: 0,
      propertyTaxAnnualOverride: 0,
      insuranceAnnualOverride: 0,
      hoaMonthly: 0,
      pmiMonthly: 0
    },
    brrrr: {
      ...defaultDealInput.brrrr,
      holdingMonths: 6,
      arvOverride: 320000,
      rehabOverride: 50000,
      refinanceLtvPercent: 0.75,
      refinanceClosingCostPercent: 0
    },
    variableExpenses: withoutVariableExpenses
  };

  const output = calculateDeal(input).brrrr;
  const meta = output.calculationBreakdown?.brrrrMeta;
  assert.ok(meta);

  const expectedPrimaryPayoff = calculateRemainingBalance(160000, 0.06, 30, 0.5, 'PI');
  const expectedHelocPayoff = calculateRemainingBalance(20000, 0.1, 10, 0.5, 'PI');
  const expectedAcquisitionDebtPayoff = expectedPrimaryPayoff + expectedHelocPayoff;

  near(meta.initialLoanPayoff, expectedAcquisitionDebtPayoff);
  near(meta.cashBackAtRefiNet, meta.refiLoanAmount - meta.refiClosingCosts - expectedAcquisitionDebtPayoff);
});

test('BRRRR cash-out refinance keeps returned capital separate from cash needed and ROI contributions', () => {
  const input = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      financingType: 'cash' as const,
      downPaymentPercent: 1,
      purchasePrice: 100000,
      rehabBudget: 0,
      arv: 300000,
      closingCostPercent: 0,
      propertyTaxAnnualOverride: 0,
      insuranceAnnualOverride: 0,
      hoaMonthly: 0,
      pmiMonthly: 0,
      helocAmount: 0,
      helocClosingCosts: 0
    },
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 0,
      otherIncomeMonthly: 0,
      ownerExpensesMonthly: 0,
      maintenancePercent: 0,
      capexPercent: 0,
      managementFeePercent: 0,
      vacancyPercent: 0
    },
    brrrr: {
      ...defaultDealInput.brrrr,
      operatingStrategy: 'longTerm' as const,
      holdingMonths: 0,
      holdingExpensesMonthly: 0,
      arvOverride: 300000,
      rehabOverride: 0,
      refinanceLtvPercent: 0.75,
      refinanceClosingCostPercent: 0
    },
    variableExpenses: withoutVariableExpenses
  };

  const output = calculateDeal(input).brrrr;
  const meta = output.calculationBreakdown?.brrrrMeta;
  assert.ok(meta);
  assert.ok(meta.investedAfterRefi < 0);
  assert.ok(output.annualCashFlow < 0);
  near(output.totalCashNeeded, 0);
  near(output.cashOnCashReturn, 0);
  const eventAmounts = output.cashFlowEvents?.map((event) => event.amount) ?? [];
  const grossContributions = eventAmounts.reduce((sum, flow) => sum + (flow < 0 ? -flow : 0), 0);
  near(output.roi, eventAmounts.reduce((sum, flow) => sum + flow, 0) / grossContributions, 1e-9);
  assert.ok(output.roi > 0);
  near(output.irr, 0);
  near(output.cashFlowTimeline[0], 125000);
});

test('fully amortizing debt stops after its stated term in hold-period returns', () => {
  const input = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      purchasePrice: 100000,
      arv: 100000,
      rehabBudget: 0,
      downPaymentPercent: 0.2,
      interestRate: 0,
      loanTermYears: 1,
      closingCostPercent: 0,
      pointsPercent: 0,
      propertyTaxAnnualOverride: 0,
      insuranceAnnualOverride: 0,
      hoaMonthly: 0,
      pmiMonthly: 0,
      helocAmount: 0,
      helocClosingCosts: 0
    },
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 0,
      otherIncomeMonthly: 0,
      ownerExpensesMonthly: 0,
      vacancyPercent: 0,
      maintenancePercent: 0,
      capexPercent: 0,
      managementFeePercent: 0,
      furnishingOneTime: 0
    },
    assumptions: {
      ...defaultDealInput.assumptions,
      holdYears: 2,
      annualAppreciationPercent: 0,
      noiGrowthPercent: 0,
      sellingCostPercent: 0
    },
    variableExpenses: withoutVariableExpenses
  };

  const output = calculateDeal(input).longTerm;
  assert.equal(output.cashFlowTimeline.length, 3);
  near(output.cashFlowTimeline[0], -20000);
  near(output.cashFlowTimeline[1], -80000);
  near(output.cashFlowTimeline[2], 100000);
  near(output.roi, 0);
});

test('fractional hold periods annualize IRR using the actual exit time', () => {
  const model: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      financingType: 'cash',
      purchasePrice: 100000,
      arv: 121000,
      downPaymentPercent: 1,
      closingCostPercent: 0,
      pointsPercent: 0,
      rehabBudget: 0,
      hoaMonthly: 0,
      pmiMonthly: 0,
      propertyTaxAnnualOverride: 0,
      insuranceAnnualOverride: 0
    },
    assumptions: {
      ...defaultDealInput.assumptions,
      holdYears: 1.5,
      annualAppreciationPercent: 0,
      noiGrowthPercent: 0,
      sellingCostPercent: 0
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
    variableExpenses: withoutVariableExpenses
  };

  const output = calculateDeal(model).longTerm;
  const expectedAnnualizedIrr = Math.pow(121000 / 100000, 1 / 1.5) - 1;

  assert.equal(output.cashFlowTimeline.length, 3);
  near(output.cashFlowTimeline[0], -100000);
  near(output.cashFlowTimeline[1], 0);
  near(output.cashFlowTimeline[2], 121000);
  near(output.irr, expectedAnnualizedIrr, 1e-9);
});

test('flip IRR annualizes the return over the entered holding months', () => {
  const model = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      financingType: 'cash' as const,
      purchasePrice: 100000,
      arv: 121000,
      downPaymentPercent: 1,
      closingCostPercent: 0,
      pointsPercent: 0,
      rehabBudget: 0,
      hoaMonthly: 0,
      pmiMonthly: 0,
      propertyTaxAnnualOverride: 0,
      insuranceAnnualOverride: 0
    },
    flip: {
      ...defaultDealInput.flip,
      arvOverride: 121000,
      rehabBudgetOverride: 0,
      rehabContingencyPercent: 0,
      holdingMonths: 18,
      agentCommissionPercent: 0,
      sellClosingCostPercent: 0,
      sellerConcessions: 0,
      hardMoneyEnabled: false
    },
    variableExpenses: withoutVariableExpenses
  };

  const output = calculateDeal(model).flip;
  const expectedAnnualizedIrr = Math.pow(121000 / 100000, 1 / 1.5) - 1;

  near(output.totalCashNeeded, 100000);
  near(output.saleProceeds ?? 0, 121000);
  near(output.irr, expectedAnnualizedIrr, 1e-9);
});

test('purchase financing percentages and costs cannot create negative debt or fake cash credits', () => {
  near(calculateLoanAmount(100000, 1.5), 0);
  near(calculateLoanAmount(100000, -0.25), 100000);
  near(calculateCashToClose(100000, -5000, 0.2, -0.03, -0.02, 'loan', 0, -200), 20000);
});

test('negative fixed-cost inputs cannot become income', () => {
  const model = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      financingType: 'cash' as const,
      purchasePrice: 100000,
      arv: 100000,
      downPaymentPercent: 1,
      closingCostPercent: 0,
      pointsPercent: 0,
      propertyTaxRatePercent: -0.02,
      insuranceRatePercent: -0.01,
      propertyTaxAnnualOverride: -1200,
      insuranceAnnualOverride: -600,
      hoaMonthly: -100,
      pmiMonthly: -50,
      rehabBudget: 0
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
    variableExpenses: withoutVariableExpenses,
    assumptions: {
      ...defaultDealInput.assumptions,
      annualAppreciationPercent: 0,
      noiGrowthPercent: 0,
      sellingCostPercent: 0
    }
  };

  const output = calculateDeal(model).longTerm;
  near(output.calculationBreakdown?.sellerPaidExpensesMonthly ?? 0, 0);
  near(output.noiMonthly ?? 0, 0);
  near(output.monthlyCashFlow, 0);
});

test('extreme negative growth and sale assumptions remain finite instead of producing NaN', () => {
  const model = zeroOperatingModel();
  const output = calculateDeal({
    ...model,
    longTerm: {
      ...model.longTerm,
      grossRentMonthly: 1000
    },
    assumptions: {
      ...model.assumptions,
      holdYears: 1.5,
      annualAppreciationPercent: -2,
      noiGrowthPercent: -2,
      sellingCostPercent: 2
    }
  }).longTerm;

  assert.ok(output.cashFlowTimeline.every(Number.isFinite));
  assert.ok(Number.isFinite(output.irr));
  assert.ok(Number.isFinite(output.roi));
  assert.ok(Number.isFinite(output.saleProceeds ?? Number.NaN));
});

test('fully paid owned properties never inherit stale acquisition loan debt', () => {
  const base = zeroOperatingModel();
  const model = {
    ...base,
    purchase: {
      ...base.purchase,
      ownershipMode: 'owned' as const,
      financingType: 'loan' as const,
      purchasePrice: 285000,
      ownedPurchasePrice: 100000,
      existingMortgageBalance: 0,
      existingMortgageMonthly: 0,
      helocAmount: 0
    },
    longTerm: {
      ...base.longTerm,
      grossRentMonthly: 1000
    }
  };

  const output = calculateDeal(model).longTerm;

  near(output.noiMonthly ?? 0, 1000);
  near(output.calculationBreakdown?.debtServiceMonthly ?? 0, 0);
  near(output.monthlyCashFlow, 1000);
});

test('owned flip treats a HELOC draw as project funding instead of new cash invested', () => {
  const base = zeroOperatingModel();
  const model = {
    ...base,
    purchase: {
      ...base.purchase,
      ownershipMode: 'owned' as const,
      financingType: 'cash' as const,
      ownedPurchasePrice: 100000,
      ownedMoneyDown: 10000,
      ownedAdditionalInvested: 0,
      existingMortgageBalance: 0,
      existingMortgageMonthly: 0,
      helocAmount: 100000,
      helocClosingCosts: 0,
      helocRate: 0,
      helocAmortizationType: 'IO' as const
    },
    flip: {
      ...base.flip,
      arvOverride: 250000,
      rehabOverride: 100000,
      rehabContingencyPercent: 0,
      holdingMonths: 12,
      agentCommissionPercent: 0,
      sellClosingCostPercent: 0,
      sellerConcessions: 0,
      hardMoneyEnabled: false
    }
  };

  const output = calculateDeal(model).flip;

  near(output.totalCashNeeded, 10000);
  near(output.saleProceeds ?? 0, 150000);
});

test('BRRRR refinance debt uses its own amortization term', () => {
  const input: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      purchasePrice: 100000,
      financingType: 'cash',
      loanTermYears: 1,
      closingCostPercent: 0,
      pointsPercent: 0,
      rehabBudget: 0,
      propertyTaxAnnualOverride: 0,
      insuranceAnnualOverride: 0,
      hoaMonthly: 0,
      pmiMonthly: 0
    },
    brrrr: {
      ...defaultDealInput.brrrr,
      arvOverride: 200000,
      rehabOverride: 0,
      holdingMonths: 6,
      refinanceLtvPercent: 0.75,
      refinanceRate: 0.08,
      refinanceTermYears: 30,
      refinanceClosingCostPercent: 0
    },
    variableExpenses: withoutVariableExpenses
  };

  const output = calculateDeal(input).brrrr;
  const refiPrincipal = output.calculationBreakdown?.brrrrMeta?.refiLoanAmount ?? 0;
  near(output.calculationBreakdown?.debtServiceMonthly ?? Number.NaN, calculateMonthlyPayment(refiPrincipal, 0.08, 30), 1e-8);
});

test('legacy BRRRR inputs without a refinance term default to 30-year amortization', () => {
  const input = zeroOperatingModel();
  input.brrrr = { ...input.brrrr, refinanceRate: 0.08, refinanceLtvPercent: 0.75 };
  Reflect.deleteProperty(input.brrrr, 'refinanceTermYears');
  const output = calculateDeal(input).brrrr;
  const refiPrincipal = output.calculationBreakdown?.brrrrMeta?.refiLoanAmount ?? 0;
  near(output.calculationBreakdown?.debtServiceMonthly ?? Number.NaN, calculateMonthlyPayment(refiPrincipal, 0.08, 30), 1e-8);
});

test('owned zero-payment mortgage preserves its maturity balloon instead of free amortization', () => {
  const input = zeroOperatingModel();
  input.purchase = {
    ...input.purchase,
    ownershipMode: 'owned',
    financingType: 'cash',
    purchasePrice: 0,
    arv: 100000,
    ownedPurchasePrice: 100000,
    ownedMoneyDown: 20000,
    ownedAdditionalInvested: 0,
    existingMortgageBalance: 80000,
    existingMortgageMonthly: 0,
    existingMortgageRate: 0,
    existingMortgageRemainingYears: 1,
    helocAmount: 0,
    propertyTaxAnnualOverride: 0,
    insuranceAnnualOverride: 0,
    hoaMonthly: 0,
    pmiMonthly: 0
  };
  input.assumptions = {
    ...input.assumptions,
    holdYears: 1,
    annualAppreciationPercent: 0,
    sellingCostPercent: 0,
    noiGrowthPercent: 0
  };

  const output = calculateDeal(input).longTerm;
  const metrics = getProjectionMetrics(output, 1, input);
  const operatingTotal = (output.cashFlowEvents ?? [])
    .filter((event) => event.category === 'operating')
    .reduce((sum, event) => sum + event.amount, 0);

  near(operatingTotal, -80000, 1e-8);
  near(output.cashFlowTimeline[1] ?? Number.NaN, 20000, 1e-8);
  near(output.roi, 0, 1e-10);
  near(metrics.modeledProfit, 0, 1e-8);
  near(metrics.paybackMonths ?? Number.NaN, 1, 1e-8);
});

test('hold-strategy ROI and projections preserve sale-year operating contributions', () => {
  const input: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      financingType: 'cash',
      purchasePrice: 100000,
      arv: 100000,
      rehabBudget: 0,
      closingCostPercent: 0,
      pointsPercent: 0,
      propertyTaxAnnualOverride: 0,
      insuranceAnnualOverride: 0,
      hoaMonthly: 0,
      pmiMonthly: 0
    },
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 0,
      otherIncomeMonthly: 0,
      vacancyPercent: 0,
      maintenancePercent: 0,
      capexPercent: 0,
      managementFeePercent: 0,
      ownerExpensesMonthly: 1000
    },
    variableExpenses: [],
    assumptions: {
      ...defaultDealInput.assumptions,
      holdYears: 2,
      annualAppreciationPercent: 0,
      sellingCostPercent: 0,
      noiGrowthPercent: 0
    }
  };

  const result = calculateDeal(input);
  const output = result.longTerm;
  const metrics = getProjectionMetrics(output, input.assumptions.holdYears, input);
  const eventAmounts = output.cashFlowEvents?.map((event) => event.amount) ?? [];

  near(eventAmounts.reduce((sum, amount) => sum + (amount < 0 ? -amount : 0), 0), 124000, 1e-6);
  near(output.roi, -24000 / 124000, 1e-10);
  near(metrics.totalInvested, 124000, 1e-8);
  near(metrics.modeledProfit, -24000, 1e-8);
  const report = createPdfReportSchema(input, result, 'longTerm');
  assert.equal(report.summary.rows.find((row) => row.label === 'Total Cash Invested')?.value, '$124,000');
});

test('BRRRR projection totals use the complete timeline without counting later contributions twice', () => {
  const input: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      purchasePrice: 140000,
      rehabBudget: 30000,
      closingCostPercent: 0,
      pointsPercent: 0,
      propertyTaxAnnualOverride: 0,
      insuranceAnnualOverride: 0,
      hoaMonthly: 0,
      pmiMonthly: 0
    },
    assumptions: { ...defaultDealInput.assumptions, holdYears: 2, annualAppreciationPercent: 0, sellingCostPercent: 0 },
    brrrr: {
      ...defaultDealInput.brrrr,
      arvOverride: 220000,
      rehabOverride: 30000,
      holdingMonths: 6,
      refinanceLtvPercent: 0.7,
      refinanceTermYears: 30,
      refinanceClosingCostPercent: 0
    },
    variableExpenses: withoutVariableExpenses
  };

  const output = calculateDeal(input).brrrr;
  const metrics = getProjectionMetrics(output, input.assumptions.holdYears, input);
  const eventAmounts = output.cashFlowEvents?.map((event) => event.amount) ?? [];
  const grossContributions = eventAmounts.reduce((sum, flow) => sum + (flow < 0 ? -flow : 0), 0);
  const netProfit = eventAmounts.reduce((sum, flow) => sum + flow, 0);
  near(metrics.totalInvested, grossContributions, 1e-8);
  near(metrics.modeledProfit, netProfit, 1e-8);
  near(metrics.modeledTotalReturn, grossContributions + netProfit, 1e-8);
});

test('BRRRR payback uses engine-consistent ARV and post-refinance appreciation timing', () => {
  const missingArvInput: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      financingType: 'cash',
      purchasePrice: 50000,
      arv: 0,
      rehabBudget: 0,
      closingCostPercent: 0,
      pointsPercent: 0,
      propertyTaxAnnualOverride: 0,
      insuranceAnnualOverride: 0,
      hoaMonthly: 0,
      pmiMonthly: 0
    },
    assumptions: { ...defaultDealInput.assumptions, holdYears: 2, annualAppreciationPercent: 0.1, sellingCostPercent: 0 },
    brrrr: {
      ...defaultDealInput.brrrr,
      arvOverride: 0,
      rehabOverride: 0,
      holdingMonths: 6,
      holdingExpensesMonthly: 0,
      refinanceLtvPercent: 0,
      refinanceClosingCostPercent: 0
    },
    variableExpenses: withoutVariableExpenses
  };
  const missingArvOutput = calculateDeal(missingArvInput).brrrr;
  near(missingArvOutput.saleProceeds ?? Number.NaN, 0, 1e-8);
  assert.equal(getProjectionMetrics(missingArvOutput, 2, missingArvInput).paybackMonths, null);

  const delayedAppreciationInput: DealInputModel = {
    ...missingArvInput,
    purchase: { ...missingArvInput.purchase, purchasePrice: 116000 },
    brrrr: { ...missingArvInput.brrrr, arvOverride: 100000 }
  };
  const delayedOutput = calculateDeal(delayedAppreciationInput).brrrr;
  near(delayedOutput.saleProceeds ?? Number.NaN, 100000 * Math.pow(1.1, 1.5), 1e-6);
  assert.ok((delayedOutput.cashFlowEvents ?? []).reduce((sum, event) => sum + event.amount, 0) < 0);
  assert.equal(getProjectionMetrics(delayedOutput, 2, delayedAppreciationInput).paybackMonths, null);
});

test('BRRRR fractional refinance events remain on the exact refinance boundary', () => {
  const input = brrrrEventModel(0);
  input.brrrr.holdingMonths = 6.5;
  const output = calculateDeal(input).brrrr;
  const refiEvents = output.cashFlowEvents?.filter((event) => event.category === 'refinance') ?? [];

  assert.equal(refiEvents.length, 1);
  near(refiEvents[0]?.month ?? Number.NaN, 6.5, 1e-12);
  const operatingMonths = (output.cashFlowEvents ?? [])
    .filter((event) => event.category === 'operating')
    .map((event) => event.month)
    .sort((left, right) => left - right);
  const refinanceBoundaryIndex = operatingMonths.findIndex((month) => Math.abs(month - 6.5) < 1e-9);
  assert.ok(refinanceBoundaryIndex >= 0);
  near(operatingMonths[refinanceBoundaryIndex + 1] ?? Number.NaN, 7.5, 1e-10);
  near(getModeledSaleCashAtMonth(output, input, 24), output.saleProceeds ?? 0, 1e-6);
  near(
    (output.cashFlowEvents ?? []).reduce((sum, event) => sum + event.amount, 0),
    output.roi * (output.cashFlowEvents ?? []).reduce((sum, event) => sum + (event.amount < 0 ? -event.amount : 0), 0),
    1e-6
  );
});

test('BRRRR payback does not receive refinance proceeds before the refinance month', () => {
  const input = brrrrEventModel(0);
  input.assumptions.sellingCostPercent = 0.1;
  const output = calculateDeal(input).brrrr;
  assert.equal(getProjectionMetrics(output, 2, input).paybackMonths, null);
});

test('BRRRR gross contributions remain visible when refinance proceeds share an annual bucket', () => {
  const input = brrrrEventModel(10000);
  const output = calculateDeal(input).brrrr;
  const metrics = getProjectionMetrics(output, 2, input);
  near(metrics.totalInvested, 164000, 1e-6);
  near(output.roi, -60000 / 164000, 1e-8);
  near(metrics.modeledProfit, -60000, 1e-6);
});

test('BRRRR does not create a refinance after the modeled sale date', () => {
  const input: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      purchasePrice: 100000,
      downPaymentPercent: 0.2,
      closingCostPercent: 0,
      pointsPercent: 0,
      rehabBudget: 0,
      propertyTaxAnnualOverride: 0,
      insuranceAnnualOverride: 0,
      hoaMonthly: 0,
      pmiMonthly: 0
    },
    assumptions: { ...defaultDealInput.assumptions, holdYears: 1, annualAppreciationPercent: 0, sellingCostPercent: 0 },
    brrrr: {
      ...defaultDealInput.brrrr,
      arvOverride: 150000,
      rehabOverride: 0,
      holdingMonths: 18,
      refinanceLtvPercent: 0.75,
      refinanceClosingCostPercent: 0
    },
    variableExpenses: withoutVariableExpenses
  };

  const output = calculateDeal(input).brrrr;
  near(output.calculationBreakdown?.brrrrMeta?.refiLoanAmount ?? -1, 0);
  near(output.calculationBreakdown?.brrrrMeta?.cashBackAtRefiNet ?? -1, 0);
  near(output.noiMonthly ?? -1, 0);
  near(output.capRate, 0);
  assert.ok((output.calculationBreakdown?.debtServiceMonthly ?? 0) > 0);
  assert.equal(output.cashFlowTimeline.length, 2);
});

test('owned BRRRR HELOC draws reduce rehab cash required', () => {
  const base: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      ownershipMode: 'owned',
      ownedPurchasePrice: 100000,
      ownedMoneyDown: 0,
      ownedAdditionalInvested: 0,
      existingMortgageBalance: 0,
      existingMortgageMonthly: 0,
      helocAmount: 0,
      helocClosingCosts: 0,
      propertyTaxAnnualOverride: 0,
      insuranceAnnualOverride: 0,
      hoaMonthly: 0,
      pmiMonthly: 0
    },
    brrrr: {
      ...defaultDealInput.brrrr,
      arvOverride: 180000,
      rehabOverride: 30000,
      refinanceLtvPercent: 0,
      refinanceClosingCostPercent: 0
    },
    variableExpenses: withoutVariableExpenses
  };

  const withoutHeloc = calculateDeal(base).brrrr.cashFlowTimeline[0] ?? 0;
  const withHeloc = calculateDeal({
    ...base,
    purchase: { ...base.purchase, helocAmount: 10000, helocRate: 0, helocTermYears: 30, helocAmortizationType: 'IO' }
  }).brrrr.cashFlowTimeline[0] ?? 0;
  near(withHeloc - withoutHeloc, 10000, 1e-8);
});

test('owned mortgage payoff follows the entered payment schedule', () => {
  const input: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      ownershipMode: 'owned',
      ownedPurchasePrice: 100000,
      ownedMoneyDown: 0,
      ownedAdditionalInvested: 0,
      existingMortgageBalance: 100000,
      existingMortgageMonthly: 1000,
      existingMortgageRate: 0,
      existingMortgageRemainingYears: 30,
      propertyTaxAnnualOverride: 0,
      insuranceAnnualOverride: 0,
      hoaMonthly: 0,
      pmiMonthly: 0
    },
    assumptions: { ...defaultDealInput.assumptions, holdYears: 1, annualAppreciationPercent: 0, sellingCostPercent: 0 },
    longTerm: { ...zeroOperatingModel().longTerm, arvOverride: 100000 },
    variableExpenses: withoutVariableExpenses
  };

  const output = calculateDeal(input).longTerm;
  near(output.saleProceeds ?? Number.NaN, 12000, 1e-8);
});

test('turnaround ARV appreciation starts after stabilization year', () => {
  const input: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      financingType: 'cash',
      purchasePrice: 100000,
      closingCostPercent: 0,
      pointsPercent: 0,
      rehabBudget: 0,
      propertyTaxAnnualOverride: 0,
      insuranceAnnualOverride: 0,
      hoaMonthly: 0,
      pmiMonthly: 0
    },
    assumptions: { ...defaultDealInput.assumptions, holdYears: 2, annualAppreciationPercent: 0.1, sellingCostPercent: 0 },
    longTerm: {
      ...defaultDealInput.longTerm,
      turnaround: {
        ...defaultDealInput.longTerm.turnaround,
        enabled: true,
        stabilizedArvOverride: 200000,
        stabilizedGrossRentMonthly: 1000,
        stabilizedOtherIncomeMonthly: 0,
        rehabBudgetForStabilization: 0,
        annualTaxInsuranceAdjustment: 0,
        vacancyPercent: 0,
        managementFeePercent: 0,
        maintenancePercent: 0,
        capexPercent: 0,
        ownerPaidExpensesMonthly: 0,
        laundryIncomeMonthly: 0,
        vendingMiscIncomeMonthly: 0,
        garageIncomeMonthly: 0,
        parkingIncomeMonthly: 0,
        additionalIncomeMonthly: 0
      }
    },
    variableExpenses: withoutVariableExpenses
  };

  near(calculateDeal(input).longTerm.longTermTurnaroundSummary?.saleProceeds ?? 0, 220000, 1e-6);

  const paybackInput: DealInputModel = {
    ...input,
    assumptions: { ...input.assumptions, sellingCostPercent: 0.05 },
    longTerm: {
      ...input.longTerm,
      grossRentMonthly: 0,
      otherIncomeMonthly: 0,
      turnaround: {
        ...input.longTerm.turnaround,
        stabilizedArvOverride: 100000,
        stabilizedGrossRentMonthly: 0
      }
    }
  };
  const paybackOutput = calculateDeal(paybackInput).longTerm;
  assert.equal(getProjectionMetrics(paybackOutput, 2, paybackInput).paybackMonths, 19);
});

test('owned Flip hard money preserves the existing mortgage debt and sale payoff', () => {
  const input = zeroOperatingModel();
  input.purchase = {
    ...input.purchase,
    ownershipMode: 'owned',
    financingType: 'cash',
    purchasePrice: 0,
    arv: 120000,
    ownedPurchasePrice: 100000,
    ownedMoneyDown: 20000,
    ownedAdditionalInvested: 0,
    existingMortgageBalance: 80000,
    existingMortgageMonthly: 0,
    existingMortgageRate: 0,
    existingMortgageRemainingYears: 30,
    helocAmount: 0,
    propertyTaxAnnualOverride: 0,
    insuranceAnnualOverride: 0,
    hoaMonthly: 0,
    pmiMonthly: 0
  };
  input.assumptions = { ...input.assumptions, annualAppreciationPercent: 0, sellingCostPercent: 0 };
  input.flip = {
    ...input.flip,
    arvOverride: 120000,
    rehabOverride: 0,
    rehabContingencyPercent: 0,
    holdingMonths: 1,
    agentCommissionPercent: 0,
    sellClosingCostPercent: 0,
    sellerConcessions: 0,
    hardMoneyEnabled: true,
    hardMoneyLoanToCostPercent: 0,
    hardMoneyInterestRate: 0,
    hardMoneyPointsPercent: 0,
    hardMoneyOtherFees: 0,
    hardMoneyMinimumInterestMonths: 0
  };

  const output = calculateDeal(input).flip;
  near(output.calculationBreakdown?.flipMeta?.debtPayoffAtSale ?? Number.NaN, 80000, 1e-8);
  near(output.calculationBreakdown?.flipMeta?.saleCashReturned ?? Number.NaN, 40000, 1e-8);
  near(output.calculationBreakdown?.flipMeta?.netProfit ?? Number.NaN, 20000, 1e-8);
});

test('fractional Flip hold evaluates payback at the exact terminal month', () => {
  const input = zeroOperatingModel();
  input.purchase = {
    ...input.purchase,
    financingType: 'cash',
    purchasePrice: 100000,
    arv: 120000,
    rehabBudget: 0,
    closingCostPercent: 0,
    pointsPercent: 0,
    propertyTaxAnnualOverride: 0,
    insuranceAnnualOverride: 0,
    hoaMonthly: 0,
    pmiMonthly: 0
  };
  input.assumptions = { ...input.assumptions, annualAppreciationPercent: 0, sellingCostPercent: 0 };
  input.flip = {
    ...input.flip,
    arvOverride: 120000,
    rehabOverride: 0,
    rehabContingencyPercent: 0,
    holdingMonths: 6.5,
    agentCommissionPercent: 0,
    sellClosingCostPercent: 0,
    sellerConcessions: 0,
    hardMoneyEnabled: false
  };

  const output = calculateDeal(input).flip;
  near(getProjectionMetrics(output, 6.5 / 12, input).paybackMonths ?? Number.NaN, 6.5, 1e-10);
});

test('Flip minimum-interest catch-up is preserved in events, projections, and breakdown metadata', () => {
  const input = zeroOperatingModel();
  input.purchase.financingType = 'cash';
  input.purchase.purchasePrice = 100000;
  input.purchase.closingCostPercent = 0;
  input.purchase.pointsPercent = 0;
  input.purchase.rehabBudget = 0;
  input.purchase.propertyTaxAnnualOverride = 0;
  input.purchase.insuranceAnnualOverride = 0;
  input.purchase.hoaMonthly = 0;
  input.purchase.pmiMonthly = 0;
  input.assumptions.holdYears = 0.25;
  input.assumptions.sellingCostPercent = 0;
  input.flip = {
    ...input.flip,
    arvOverride: 100000,
    rehabOverride: 0,
    rehabContingencyPercent: 0,
    holdingMonths: 3,
    agentCommissionPercent: 0,
    sellClosingCostPercent: 0,
    sellerConcessions: 0,
    hardMoneyEnabled: true,
    hardMoneyLoanToCostPercent: 1,
    hardMoneyInterestRate: 0.12,
    hardMoneyPointsPercent: 0,
    hardMoneyOtherFees: 0,
    hardMoneyMinimumInterestMonths: 6
  };

  const output = calculateDeal(input).flip;
  const meta = output.calculationBreakdown?.flipMeta;
  const operatingOutflows = (output.cashFlowEvents ?? [])
    .filter((event) => event.category === 'operating' && event.amount < 0)
    .reduce((sum, event) => sum - event.amount, 0);

  near(meta?.hardMoneyInterestCost ?? Number.NaN, 6000, 1e-8);
  near(meta?.lenderHoldingCostsMonthly ?? Number.NaN, 2000, 1e-8);
  near(meta?.holdingCostsTotal ?? Number.NaN, 6000, 1e-8);
  near(operatingOutflows, 6000, 1e-8);
  near(output.roi, -1, 1e-8);
  near(getProjectionMetrics(output, 0.25, input).totalInvested, output.totalCashNeeded, 1e-8);
});

test('flip sale costs cannot become income and IO balloon principal is paid at maturity', () => {
  const base: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      purchasePrice: 100000,
      downPaymentPercent: 0.2,
      interestRate: 0,
      loanTermYears: 1,
      amortizationType: 'IO',
      closingCostPercent: 0,
      pointsPercent: 0,
      rehabBudget: 0,
      propertyTaxAnnualOverride: 0,
      insuranceAnnualOverride: 0,
      hoaMonthly: 0,
      pmiMonthly: 0
    },
    flip: {
      ...defaultDealInput.flip,
      arvOverride: 100000,
      rehabOverride: 0,
      rehabContingencyPercent: 0,
      holdingMonths: 12,
      agentCommissionPercent: 0,
      sellClosingCostPercent: 0,
      sellerConcessions: 0,
      hardMoneyEnabled: false
    },
    variableExpenses: withoutVariableExpenses
  };

  const baseline = calculateDeal(base).flip;
  near(baseline.calculationBreakdown?.flipMeta?.netProfit ?? Number.NaN, 0, 1e-8);

  const negativeCosts = calculateDeal({
    ...base,
    flip: { ...base.flip, agentCommissionPercent: -0.5, sellClosingCostPercent: -0.5, sellerConcessions: -50000 }
  }).flip;
  near(
    negativeCosts.calculationBreakdown?.flipMeta?.netProfit ?? Number.NaN,
    baseline.calculationBreakdown?.flipMeta?.netProfit ?? Number.NaN,
    1e-8
  );
  near(negativeCosts.saleProceeds ?? Number.NaN, baseline.saleProceeds ?? Number.NaN, 1e-8);
  near(negativeCosts.calculationBreakdown?.flipMeta?.sellerConcessions ?? Number.NaN, 0, 1e-8);
  near(
    negativeCosts.calculationBreakdown?.lines.find((line) => line.key === 'flip-seller-concessions')?.monthly ?? Number.NaN,
    0,
    1e-8
  );
});

test('flip IRR dates an interest-only balloon at sale instead of treating it as initial cash', () => {
  const input: DealInputModel = {
    ...zeroOperatingModel(),
    purchase: {
      ...zeroOperatingModel().purchase,
      financingType: 'loan',
      purchasePrice: 100000,
      arv: 120000,
      downPaymentPercent: 0.2,
      interestRate: 0,
      loanTermYears: 1,
      amortizationType: 'IO'
    },
    flip: {
      ...defaultDealInput.flip,
      arvOverride: 120000,
      rehabOverride: 0,
      rehabContingencyPercent: 0,
      holdingMonths: 12,
      agentCommissionPercent: 0,
      sellClosingCostPercent: 0,
      sellerConcessions: 0,
      hardMoneyEnabled: false
    }
  };

  const output = calculateDeal(input).flip;

  near(output.irr, 1, 1e-8);
  near(output.roi, 0.2, 1e-8);
});

test('deterministic cross-strategy matrix produces finite and internally consistent outputs', () => {
  let seed = 20260714;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let index = 0; index < 50; index += 1) {
    const model = {
      ...defaultDealInput,
      purchase: {
        ...defaultDealInput.purchase,
        purchasePrice: 75000 + next() * 925000,
        financingType: index % 4 === 0 ? ('cash' as const) : ('loan' as const),
        downPaymentPercent: next(),
        interestRate: next() * 0.15,
        loanTermYears: 1 + Math.floor(next() * 40),
        rehabBudget: next() * 150000,
        closingCostPercent: next() * 0.08,
        pointsPercent: next() * 0.05,
        hoaMonthly: next() * 800,
        pmiMonthly: next() * 500
      },
      longTerm: {
        ...defaultDealInput.longTerm,
        grossRentMonthly: next() * 8000,
        vacancyPercent: next() * 0.25,
        maintenancePercent: next() * 0.2,
        capexPercent: next() * 0.2,
        managementFeePercent: next() * 0.2
      },
      airbnb: {
        ...defaultDealInput.airbnb,
        averageDailyRate: next() * 750,
        occupancyRate: next(),
        managementPercent: next() * 0.3
      },
      padSplit: {
        ...defaultDealInput.padSplit,
        roomCount: 1 + Math.floor(next() * 12),
        weeklyRentPerRoom: next() * 500,
        occupancyRate: next(),
        managementPercent: next() * 0.3
      },
      brrrr: {
        ...defaultDealInput.brrrr,
        arvOverride: 100000 + next() * 1200000,
        holdingMonths: next() * 24,
        refinanceLtvPercent: next(),
        refinanceRate: next() * 0.15,
        refinanceTermYears: 1 + Math.floor(next() * 40)
      },
      flip: {
        ...defaultDealInput.flip,
        arvOverride: 100000 + next() * 1200000,
        holdingMonths: 1 + next() * 35,
        agentCommissionPercent: next() * 0.1,
        sellClosingCostPercent: next() * 0.08
      },
      assumptions: {
        ...defaultDealInput.assumptions,
        holdYears: next() * 20,
        annualRentGrowth: next() * 0.08,
        annualExpenseGrowth: next() * 0.08,
        annualAppreciation: next() * 0.1,
        saleCostPercent: next() * 0.12
      }
    };

    const result = calculateDeal(model);
    const outputs = [
      ['purchase', result.purchase],
      ['longTerm', result.longTerm],
      ['airbnb', result.airbnb],
      ['padSplit', result.padSplit],
      ['brrrr', result.brrrr],
      ['flip', result.flip]
    ] as const;

    for (const [strategy, output] of outputs) {
      const values = [
        output.monthlyCashFlow,
        output.annualCashFlow,
        output.cashOnCashReturn,
        output.capRate,
        output.dscr,
        output.totalCashNeeded,
        output.roi,
        output.irr,
        output.saleProceeds
      ].filter((value): value is number => value !== undefined);
      assert.ok(values.every(Number.isFinite), `non-finite ${strategy} output in scenario ${index}: ${JSON.stringify(values)}`);
      assert.ok(output.cashFlowTimeline.every(Number.isFinite), `non-finite timeline in scenario ${index}`);
      assert.ok(output.totalCashNeeded >= 0);
      near(output.annualCashFlow, output.monthlyCashFlow * 12, 1e-6);
    }
  }
});
