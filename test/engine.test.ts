import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateDeal } from '../lib/engine/deal-engine';
import { calculateInterestOnlyPayment, calculateLoanAmount, calculateMonthlyPayment } from '../lib/engine/finance';
import { buildExcelParityAnnualTimeline, calcTotalRoiFromTimeline, calculateRemainingBalance, estimateSaleProceeds } from '../lib/engine/investment-math';
import { defaultDealInput } from '../lib/models/deal';

import { createScenarioRecord, decodeScenario, encodeScenario } from '../lib/scenario-storage';

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
  const debtService = calculateMonthlyPayment(calculateLoanAmount(p.purchasePrice, p.downPaymentPercent), p.interestRate, p.loanTermYears);

  const salePrice = p.arv;
  const holdingCosts = f.holdingMonths * (f.holdingExpensesMonthly + fixedCostsMonthly() + variableCostMonthly('flip') + debtService);

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
  assert.ok(Number.isFinite(result.longTerm.irr));
});


test('flip IRR timeline exits at full terminal cash flow, not net profit only', () => {
  const result = calculateDeal(defaultDealInput);
  const { purchase: p, flip: f } = defaultDealInput;

  const fixed = fixedCostsMonthly();
  const variable = variableCostMonthly('flip');
  const debtService = calculateMonthlyPayment(calculateLoanAmount(p.purchasePrice, p.downPaymentPercent), p.interestRate, p.loanTermYears);
  const holdingCosts = f.holdingMonths * (f.holdingExpensesMonthly + fixed + variable + debtService);
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
  const result = calculateDeal(defaultDealInput);
  const { purchase: p, brrrr } = defaultDealInput;

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
      holdingMonths: 6,
      refinanceLtvPercent: 0.75,
      refinanceClosingCostPercent: 0.02
    }
  };

  const result = calculateDeal(model);
  const initialLoan = calculateLoanAmount(model.purchase.purchasePrice, model.purchase.downPaymentPercent);
  const refiLoanAmount = model.purchase.arv * model.brrrr.refinanceLtvPercent;
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
  const gross = occupiedNights * airbnb.adr + bookings * airbnb.cleaningFeeCharged;
  const noi =
    gross -
    gross * airbnb.platformFeePercent -
    bookings * airbnb.cleanerCostPerTurn -
    gross * airbnb.maintenancePercent -
    gross * airbnb.capexPercent -
    gross * airbnb.managementFeePercent -
    airbnb.ownerExpensesMonthly -
    fixedCostsMonthly(model) -
    variableCostMonthly('airbnb', model);

  near(result.airbnb.noiMonthly ?? 0, noi, 0.01);
  near(result.airbnb.totalCashNeeded, result.purchase.totalCashNeeded + airbnb.furnishingOneTime, 0.01);
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
      operatingStrategy: 'airbnb' as const
    }
  };

  const result = calculateDeal(model);
  const refiDebt = calculateMonthlyPayment(
    model.purchase.arv * model.brrrr.refinanceLtvPercent,
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

test('BRRRR rehab override does not change refinance netting in year-0 cash flow', () => {
  const baseModel = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      purchasePrice: 300000,
      arv: 420000
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

  near(highRehab.brrrr.cashFlowTimeline[0], lowRehab.brrrr.cashFlowTimeline[0], 0.01);
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
      { key: 'lt', label: 'LT', monthlyAmount: 300, appliesTo: { longTerm: true, airbnb: false, padSplit: false, flip: false } },
      { key: 'str', label: 'STR', monthlyAmount: 675, appliesTo: { longTerm: false, airbnb: true, padSplit: false, flip: false } },
      { key: 'ps', label: 'PS', monthlyAmount: 820, appliesTo: { longTerm: false, airbnb: false, padSplit: true, flip: false } }
    ]
  };

  const result = calculateDeal(fixture);

  near(result.longTerm.capRate, -0.03588888889, 1e-9);
  near(result.longTerm.cashOnCashReturn, -0.5830952405, 1e-9);
  near(result.longTerm.dscr, -0.5048807507, 1e-9);
  near(result.longTerm.irr, -0.1306043926, 1e-9);
  near(result.longTerm.roi, -3.285657625, 1e-9);

  near(result.airbnb.irr, -0.0721259459, 1e-9);
  near(result.airbnb.roi, -1.4687068242, 1e-9);

  near(result.padSplit.irr, -0.0677210758, 1e-9);
  near(result.padSplit.roi, -1.3956092061, 1e-9);

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
      dealName: 'São Paulo Duplex 🏠'
    }
  };
  const scenario = createScenarioRecord(model);
  const encoded = encodeScenario(scenario);
  const decoded = decodeScenario(encoded);

  assert.ok(decoded);
  assert.equal(decoded?.dealName, model.purchase.dealName);
  assert.equal(decoded?.payload.purchase.dealName, model.purchase.dealName);
});
