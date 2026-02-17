import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateDeal } from '../lib/engine/deal-engine';
import { calculateLoanAmount, calculateMonthlyPayment } from '../lib/engine/finance';
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
