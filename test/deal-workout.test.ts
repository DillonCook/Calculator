import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDealWorkoutRecommendation } from '../lib/engine/deal-workout';
import { defaultDealInput } from '../lib/models/deal';

test('returns no scenarios when deal already works', () => {
  const model = {
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
  const model = {
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


test('flip workout only proposes purchase price fix based on net sale proceeds', () => {
  const model = {
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
  assert.ok(rec.currentSaleProceeds < 0);
  assert.equal(rec.scenarios.length, 1);
  assert.equal(rec.scenarios[0]?.key, 'price-cut');
  assert.equal(rec.scenarios[0]?.adjustments.downPaymentPercent, undefined);
});
