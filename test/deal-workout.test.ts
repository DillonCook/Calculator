import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDealWorkoutRecommendation, findPurchasePriceForTargetIrr } from '../lib/engine/deal-workout';
import { defaultDealInput, type DealInputModel } from '../lib/models/deal';

test('returns no scenarios when deal already works', () => {
  const model: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      purchasePrice: 180000,
      arv: 220000,
      downPaymentPercent: 0.25
    },
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 2400,
      ownerExpensesMonthly: 100
    }
  };

  const rec = buildDealWorkoutRecommendation(model, 'longTerm');
  assert.equal(rec.canWorkAlready, true);
  assert.equal(rec.scenarios.length, 0);
});

test('recommends price and/or down payment scenarios for constrained debt deal', () => {
  const model: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      purchasePrice: 320000,
      arv: 320000,
      downPaymentPercent: 0.1,
      interestRate: 0.075
    },
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 2600,
      ownerExpensesMonthly: 120
    }
  };

  const rec = buildDealWorkoutRecommendation(model, 'longTerm');

  assert.equal(rec.canWorkAlready, false);
    assert.ok(rec.scenarios.length >= 1);
  assert.ok(rec.scenarios.some((s) => s.key === 'price-cut' || s.key === 'down-payment'));
});


test('cash financing price-cut recommendation never suggests a zero purchase price', () => {
  const model: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      financingType: 'cash',
      downPaymentPercent: 1,
      purchasePrice: 405000
    },
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 2600,
      ownerExpensesMonthly: 0
    }
  };

  const rec = buildDealWorkoutRecommendation(model, 'longTerm');
  const priceCutScenario = rec.scenarios.find((scenario) => scenario.key === 'price-cut');

  assert.ok(priceCutScenario);
  assert.ok((priceCutScenario?.adjustments.purchasePrice ?? 0) > 0);
});


test('flip workout only proposes purchase price fix based on net profit', () => {
  const model: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      purchasePrice: 250000,
      downPaymentPercent: 0.2,
      interestRate: 0.068,
      financingType: 'loan'
    },
    flip: {
      ...defaultDealInput.flip,
      arvOverride: 250000,
      holdingMonths: 6,
      sellerConcessions: 0
    }
  };

  const rec = buildDealWorkoutRecommendation(model, 'flip');

  assert.equal(rec.canWorkAlready, false);
  assert.ok(rec.currentNetProfit < 0);
  assert.equal(rec.scenarios.length, 1);
  assert.equal(rec.scenarios[0]?.key, 'price-cut');
  assert.equal(rec.scenarios[0]?.adjustments.downPaymentPercent, undefined);
});


test('loan price-cut scenario targets monthly cash flow break-even', () => {
  const model: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      financingType: 'loan',
      purchasePrice: 340000,
      arv: 340000,
      downPaymentPercent: 0.1,
      interestRate: 0.078
    },
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 2600,
      ownerExpensesMonthly: 100
    }
  };

  const rec = buildDealWorkoutRecommendation(model, 'longTerm');
  const priceCutScenario = rec.scenarios.find((scenario) => scenario.key === 'price-cut');

  assert.ok(priceCutScenario);
  assert.ok((priceCutScenario?.adjustments.purchasePrice ?? 0) > 0);
});

test('cash IRR target helper finds lower purchase price when target IRR increases', () => {
  const model: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      financingType: 'cash',
      downPaymentPercent: 1,
      purchasePrice: 285000
    },
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 3200,
      ownerExpensesMonthly: 150
    },
    assumptions: {
      ...defaultDealInput.assumptions,
      holdYears: 7,
      annualAppreciationPercent: 0.03
    }
  };

  const priceAt8Pct = findPurchasePriceForTargetIrr(model, 'longTerm', 0.08);
  const priceAt12Pct = findPurchasePriceForTargetIrr(model, 'longTerm', 0.12);

  assert.ok(typeof priceAt8Pct === 'number');
  assert.ok(typeof priceAt12Pct === 'number');
  assert.ok((priceAt12Pct ?? 0) <= (priceAt8Pct ?? 0));
});
