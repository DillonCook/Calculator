import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateDeal } from '../lib/engine/deal-engine';
import { calculateInterestOnlyPayment, calculateLoanAmount, calculateMonthlyPayment } from '../lib/engine/finance';
import { calculateRemainingBalance, estimateSaleProceeds } from '../lib/engine/investment-math';
import { defaultDealInput } from '../lib/models/deal';

const near = (actual: number, expected: number, epsilon = 0.01) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `Expected ${actual} to be within ${epsilon} of ${expected}`);
};

const fixedCostsMonthly = (input = defaultDealInput) => {
  const annualTax = input.purchase.propertyTaxAnnualOverride ?? input.purchase.purchasePrice * 0.017;
  const annualInsurance = input.purchase.insuranceAnnualOverride ?? input.purchase.purchasePrice * 0.01;
  return annualTax / 12 + annualInsurance / 12 + input.purchase.hoaMonthly + input.purchase.pmiMonthly;
};

const variableCostMonthly = (strategy: 'longTerm' | 'airbnb' | 'padSplit' | 'flip', input = defaultDealInput) =>
  input.variableExpenses.reduce((sum, entry) => (entry.appliesTo[strategy] ? sum + entry.monthlyAmount : sum), 0);

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

test('long-term module includes base fixed and variable expenses', () => {
  const result = calculateDeal(defaultDealInput);
  const p = defaultDealInput.purchase;
  const lt = defaultDealInput.longTerm;

  const gross = lt.grossRentMonthly + lt.otherIncomeMonthly;
  const noi =
    gross -
    gross * lt.vacancyPercent -
    gross * lt.maintenancePercent -
    gross * lt.capexPercent -
    lt.ownerExpensesMonthly -
    fixedCostsMonthly() -
    variableCostMonthly('longTerm');
  const debt = calculateMonthlyPayment(calculateLoanAmount(p.purchasePrice, p.downPaymentPercent), p.interestRate, p.loanTermYears);
  const expectedMonthly = noi - debt;

  near(result.longTerm.noiMonthly ?? 0, noi);
  near(result.longTerm.monthlyCashFlow, expectedMonthly);
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

test('flip includes variable and fixed expense carry by months', () => {
  const result = calculateDeal(defaultDealInput);
  const { purchase: p, flip: f } = defaultDealInput;

  const salePrice = p.arv;
  const holdingCosts = f.holdingMonths * (f.holdingExpensesMonthly + fixedCostsMonthly() + variableCostMonthly('flip'));

  const netProfit =
    salePrice -
    p.purchasePrice -
    p.rehabBudget -
    p.purchasePrice * p.closingCostPercent -
    salePrice * f.agentCommissionPercent -
    salePrice * f.sellClosingCostPercent -
    f.sellerConcessions -
    holdingCosts;

  near(result.flip.monthlyCashFlow, netProfit / f.holdingMonths);
});

test('long-term timeline covers Year 0..N and produces irr from cashflows', () => {
  const result = calculateDeal(defaultDealInput);
  const holdYears = defaultDealInput.assumptions.holdYears;

  assert.equal(result.longTerm.cashFlowTimeline.length, holdYears + 1);
  assert.ok(result.longTerm.cashFlowTimeline[0] < 0);
  assert.ok(result.longTerm.irr !== 0);
});


test('flip IRR timeline exits at full terminal cash flow, not net profit only', () => {
  const result = calculateDeal(defaultDealInput);
  const { purchase: p, flip: f } = defaultDealInput;

  const fixed = fixedCostsMonthly();
  const variable = variableCostMonthly('flip');
  const holdingCosts = f.holdingMonths * (f.holdingExpensesMonthly + fixed + variable);
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

test('brrrr IRR timeline includes refinance cash event in year one', () => {
  const result = calculateDeal(defaultDealInput);
  const { purchase: p, brrrr, assumptions } = defaultDealInput;

  const strategyVariableCosts = variableCostMonthly('flip');
  const holdingCosts = brrrr.holdingMonths * (brrrr.holdingExpensesMonthly + fixedCostsMonthly() + strategyVariableCosts);
  const initialOutflow = result.purchase.totalCashNeeded + holdingCosts;

  const refiLoanAmount = p.arv * brrrr.refinanceLtvPercent;
  const refiClosingCosts = refiLoanAmount * brrrr.refinanceClosingCostPercent;
  const initialLoan = calculateLoanAmount(p.purchasePrice, p.downPaymentPercent);
  const payoffInitialLoan = calculateRemainingBalance(initialLoan, p.interestRate, p.loanTermYears, brrrr.holdingMonths / 12, 'PI');
  const cashBackAtRefi = refiLoanAmount - payoffInitialLoan - p.rehabBudget - refiClosingCosts;

  near(result.brrrr.cashFlowTimeline[0], -Math.abs(initialOutflow));
  assert.ok(result.brrrr.cashFlowTimeline.length >= 2);

  const baseYearOneFlow = result.brrrr.annualCashFlow * Math.pow(1 + assumptions.noiGrowthPercent, 0);
  const yearOneSale = assumptions.holdYears === 1 ? result.brrrr.saleProceeds : 0;
  near(result.brrrr.cashFlowTimeline[1], baseYearOneFlow + yearOneSale + cashBackAtRefi);
});


test('long-term CoC, ROI, and DSCR align with underwriting formulas', () => {
  const result = calculateDeal(defaultDealInput);
  const p = defaultDealInput.purchase;
  const lt = defaultDealInput.longTerm;

  const gross = lt.grossRentMonthly + lt.otherIncomeMonthly;
  const noi =
    gross -
    gross * lt.vacancyPercent -
    gross * lt.maintenancePercent -
    gross * lt.capexPercent -
    lt.ownerExpensesMonthly -
    fixedCostsMonthly() -
    variableCostMonthly('longTerm');

  const debt = calculateMonthlyPayment(calculateLoanAmount(p.purchasePrice, p.downPaymentPercent), p.interestRate, p.loanTermYears);
  const monthly = noi - debt;
  const annual = monthly * 12;
  const expectedCoc = annual / result.purchase.totalCashNeeded;
  const expectedRoi = (annual * defaultDealInput.assumptions.holdYears) / result.purchase.totalCashNeeded;
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
      helocRate: 0.1
    }
  };

  const result = calculateDeal(model);
  const gross = model.longTerm.grossRentMonthly + model.longTerm.otherIncomeMonthly;
  const noi =
    gross -
    gross * model.longTerm.vacancyPercent -
    gross * model.longTerm.maintenancePercent -
    gross * model.longTerm.capexPercent -
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
      holdingMonths: 6,
      refinanceLtvPercent: 0.75,
      refinanceClosingCostPercent: 0.02
    }
  };

  const result = calculateDeal(model);
  const initialLoan = calculateLoanAmount(model.purchase.purchasePrice, model.purchase.downPaymentPercent);
  const payoffInitialLoan = calculateRemainingBalance(initialLoan, model.purchase.interestRate, model.purchase.loanTermYears, model.brrrr.holdingMonths / 12, 'PI');
  const refiLoanAmount = model.purchase.arv * model.brrrr.refinanceLtvPercent;
  const refiCosts = refiLoanAmount * model.brrrr.refinanceClosingCostPercent;

  const expectedCashBack = refiLoanAmount - payoffInitialLoan - model.purchase.rehabBudget - refiCosts;
  const baseYearOneFlow = result.brrrr.annualCashFlow;
  const yearOneSale = model.assumptions.holdYears === 1 ? result.brrrr.saleProceeds ?? 0 : 0;

  near(result.brrrr.cashFlowTimeline[1], baseYearOneFlow + yearOneSale + expectedCashBack, 0.01);
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
