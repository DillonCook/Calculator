import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateDeal } from '../lib/engine/deal-engine';
import { calculateLoanAmount, calculateMonthlyPayment } from '../lib/engine/finance';
import { defaultDealInput } from '../lib/models/deal';

const near = (actual: number, expected: number, epsilon = 0.01) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `Expected ${actual} to be within ${epsilon} of ${expected}`);
};

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

test('long-term module returns correct NOI, debt service, monthly and cap rate', () => {
  const result = calculateDeal(defaultDealInput);
  const p = defaultDealInput.purchase;
  const lt = defaultDealInput.longTerm;

  const gross = lt.grossRentMonthly + lt.otherIncomeMonthly;
  const noi = gross - gross * lt.vacancyPercent - gross * lt.maintenancePercent - gross * lt.capexPercent - lt.ownerExpensesMonthly;
  const debt = calculateMonthlyPayment(calculateLoanAmount(p.purchasePrice, p.downPaymentPercent), p.interestRate, p.loanTermYears);
  const expectedMonthly = noi - debt;
  const expectedCapRate = (noi * 12) / p.purchasePrice;

  near(result.longTerm.noiMonthly ?? 0, noi);
  near(result.longTerm.monthlyCashFlow, expectedMonthly);
  near(result.longTerm.capRate, expectedCapRate, 0.000001);
});

test('BRRRR monthly cash flow uses refinance debt service and refinance rate', () => {
  const result = calculateDeal(defaultDealInput);
  const p = defaultDealInput.purchase;
  const b = defaultDealInput.brrrr;
  const ltNoi = result.longTerm.noiMonthly ?? 0;

  const refiLoanAmount = p.arv * b.refinanceLtvPercent;
  const refiDebt = calculateMonthlyPayment(refiLoanAmount, b.refinanceRate, p.loanTermYears);
  const expectedMonthly = ltNoi - refiDebt;

  near(result.brrrr.monthlyCashFlow, expectedMonthly);
});

test('flip net profit math matches monthly and ROI', () => {
  const result = calculateDeal(defaultDealInput);
  const { purchase: p, flip: f } = defaultDealInput;

  const salePrice = p.arv;
  const netProfit =
    salePrice -
    p.purchasePrice -
    p.rehabBudget -
    p.purchasePrice * p.closingCostPercent -
    salePrice * f.agentCommissionPercent -
    salePrice * f.sellClosingCostPercent -
    f.sellerConcessions -
    f.holdingMonths * f.holdingExpensesMonthly;

  near(result.flip.monthlyCashFlow, netProfit / f.holdingMonths);
  near(result.flip.roi, netProfit / result.purchase.totalCashNeeded, 0.000001);
});


test('long-term timeline covers Year 0..N and produces irr from cashflows', () => {
  const result = calculateDeal(defaultDealInput);
  const holdYears = defaultDealInput.assumptions.holdYears;

  assert.equal(result.longTerm.cashFlowTimeline.length, holdYears + 1);
  assert.ok(result.longTerm.cashFlowTimeline[0] < 0);
  assert.ok(result.longTerm.irr !== 0);
});
