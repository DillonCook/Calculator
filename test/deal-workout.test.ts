import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDealWorkoutRecommendation, findPurchasePriceForTargetIrr } from '../lib/engine/deal-workout';
import { calculateDeal } from '../lib/engine/deal-engine';
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


test('owned-property workouts do not fabricate a new acquisition price or down-payment fix', () => {
  const model: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      ownershipMode: 'owned',
      financingType: 'loan',
      purchasePrice: 350000,
      ownedPurchasePrice: 100000,
      existingMortgageBalance: 0,
      existingMortgageMonthly: 0,
      existingMortgageRate: 0.07,
      existingMortgageRemainingYears: 30,
      existingTaxMonthly: 0,
      existingInsuranceMonthly: 0,
      hoaMonthly: 0,
      pmiMonthly: 0,
      helocAmount: 0
    },
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 2600,
      otherIncomeMonthly: 0,
      vacancyPercent: 0,
      maintenancePercent: 0,
      capexPercent: 0,
      managementFeePercent: 0,
      ownerExpensesMonthly: 0
    },
    variableExpenses: defaultDealInput.variableExpenses.map((expense) => ({ ...expense, monthlyAmount: 0 }))
  };

  const recommendation = buildDealWorkoutRecommendation(model, 'longTerm');

  assert.ok(recommendation.currentMonthlyCashFlow > 0);
  assert.equal(recommendation.canWorkAlready, true);
  assert.deepEqual(recommendation.scenarios, []);
});

test('cash financing price-cut recommendation never suggests a zero purchase price', () => {
  const model: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      financingType: 'cash',
      downPaymentPercent: 1,
      purchasePrice: 1000000
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

test('cash-financed deals that cash flow positively already work without a DSCR hurdle', () => {
  const model: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      financingType: 'cash',
      downPaymentPercent: 1,
      purchasePrice: 100000,
      arv: 100000
    },
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 3000,
      otherIncomeMonthly: 0,
      ownerExpensesMonthly: 0
    }
  };

  const rec = buildDealWorkoutRecommendation(model, 'longTerm');

  assert.ok(rec.currentMonthlyCashFlow > 0);
  assert.equal(rec.currentDscr, 0);
  assert.equal(rec.canWorkAlready, true);
  assert.deepEqual(rec.scenarios, []);
});

test('cash deal workout finds a lower purchase price when taxes and insurance make the current price unworkable', () => {
  const model: DealInputModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      financingType: 'cash',
      purchasePrice: 500000,
      arv: 500000,
      downPaymentPercent: 1,
      closingCostPercent: 0,
      pointsPercent: 0,
      propertyTaxRatePercent: 0.02,
      insuranceRatePercent: 0.01,
      propertyTaxAnnualOverride: null,
      insuranceAnnualOverride: null,
      hoaMonthly: 0,
      pmiMonthly: 0
    },
    longTerm: {
      ...defaultDealInput.longTerm,
      grossRentMonthly: 1000,
      otherIncomeMonthly: 0,
      vacancyPercent: 0,
      maintenancePercent: 0,
      capexPercent: 0,
      managementFeePercent: 0,
      ownerExpensesMonthly: 0
    },
    variableExpenses: defaultDealInput.variableExpenses.map((expense) => ({ ...expense, monthlyAmount: 0 }))
  };

  const recommendation = buildDealWorkoutRecommendation(model, 'longTerm');
  const priceScenario = recommendation.scenarios.find((scenario) => scenario.key === 'price-cut');

  assert.equal(recommendation.canWorkAlready, false);
  assert.equal(recommendation.constrainedByOperations, false);
  assert.ok(priceScenario?.adjustments.purchasePrice);

  const adjusted: DealInputModel = {
    ...model,
    purchase: {
      ...model.purchase,
      purchasePrice: priceScenario?.adjustments.purchasePrice ?? model.purchase.purchasePrice
    }
  };
  assert.ok(calculateDeal(adjusted).longTerm.monthlyCashFlow >= 0);
});
