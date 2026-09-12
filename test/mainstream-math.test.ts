import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDeal } from '@/lib/engine/deal-engine';
import { defaultDealInput } from '@/lib/models/deal';
import { getModeledSaleCashAtMonth } from '@/lib/projection-metrics';

const fixture = () => {
  const model = structuredClone(defaultDealInput);
  Object.assign(model.purchase, { purchasePrice: 100000, arv: 150000, rehabBudget: 10000, financingType: 'cash', closingCostPercent: 0, pointsPercent: 0, helocAmount: 0, propertyTaxAnnualOverride: 0, insuranceAnnualOverride: 0, hoaMonthly: 0, pmiMonthly: 0 });
  Object.assign(model.flip, { arvOverride: 150000, rehabOverride: 10000, rehabContingencyPercent: 0, agentCommissionPercent: 0, sellClosingCostPercent: 0, sellerConcessions: 0, holdingMonths: 6, hardMoneyEnabled: false, targetProfit: 200000, targetRoiPercent: 0.2 });
  model.variableExpenses = model.variableExpenses.map(e => ({ ...e, monthlyAmount: 0 }));
  Object.assign(model.assumptions, { holdYears: 1, annualAppreciationPercent: 0, sellingCostPercent: 0, noiGrowthPercent: 0 });
  return model;
};

test('An impossible requested flip profit cannot be discarded from the combined offer', () => {
  const meta = calculateDeal(fixture()).flip.calculationBreakdown!.flipMeta!;
  assert.equal(meta.maxOfferForTargetProfit, null);
  assert.ok(meta.maxOfferForTargetRoi !== null);
  assert.equal(meta.maxAllowableOffer, null);
});

test('Positive-price zero-cost cash flips have a valid ROI offer boundary', () => {
  const model = fixture();
  model.purchase.rehabBudget = 0;
  Object.assign(model.flip, { rehabOverride: 0, targetProfit: 0 });
  const meta = calculateDeal(model).flip.calculationBreakdown!.flipMeta!;
  assert.ok(meta.maxAllowableOffer !== null);
  assert.ok(Math.abs(meta.maxAllowableOffer - 125000) <= 0.01);
  model.purchase.purchasePrice = meta.maxAllowableOffer;
  assert.ok(calculateDeal(model).flip.roi >= 0.2);
});


test('Excess HELOC proceeds remain in the cash ledger instead of becoming a fictitious loss', () => {
  const model = fixture();
  Object.assign(model.purchase, { arv: 100000, rehabBudget: 0, helocAmount: 120000, helocRate: 0, helocTermYears: 30, helocAmortizationType: 'IO' });
  Object.assign(model.longTerm, { grossRentMonthly: 0, otherIncomeMonthly: 0, ownerExpensesMonthly: 0, annualRevenueOverride: null });
  const output = calculateDeal(model).longTerm;
  assert.equal(output.cashFlowEvents?.filter(e => e.month === 0).reduce((sum, e) => sum + e.amount, 0), 20000);
  assert.equal(output.cashFlowEvents?.reduce((sum, e) => sum + e.amount, 0), 0);
});


test('BRRRR retains excess acquisition draw before a later zero-LTV refinance', () => {
  const model = fixture();
  Object.assign(model.purchase, { rehabBudget: 0, helocAmount: 120000, helocRate: 0, helocTermYears: 30, helocAmortizationType: 'IO' });
  Object.assign(model.brrrr, { rehabOverride: 0, arvOverride: 100000, holdingMonths: 6, refinanceLtvPercent: 0, holdingExpensesMonthly: 0 });
  Object.assign(model.longTerm, { grossRentMonthly: 0, otherIncomeMonthly: 0, ownerExpensesMonthly: 0 });
  const output = calculateDeal(model).brrrr;
  assert.equal(output.cashFlowEvents!.filter(e => e.month === 0).reduce((s,e) => s + e.amount,0),20000);
  assert.ok(Math.abs(output.cashFlowEvents!.reduce((s,e) => s + e.amount,0)) < 0.001);
});


test('Flip net profit includes excess funded cash and the full debt payoff exactly once', () => {
  const model = fixture();
  Object.assign(model.purchase, { rehabBudget: 0, helocAmount: 120000, helocRate: 0, helocTermYears: 30, helocAmortizationType: 'IO' });
  Object.assign(model.flip, { rehabOverride: 0, arvOverride: 100000 });
  const output = calculateDeal(model).flip;
  assert.equal(output.calculationBreakdown!.flipMeta!.netProfit,0);
  assert.equal(output.cashFlowEvents!.reduce((s,e) => s+e.amount,0),0);
});


test('Missing BRRRR ARV never falls back to a contradictory projection value', () => {
  const model = fixture();
  model.brrrr.arvOverride = null;
  const output = calculateDeal(model).brrrr;
  assert.equal(getModeledSaleCashAtMonth(output, model, 12), output.saleProceeds);
});


test('Sale before turnaround stabilization uses acquisition value in every consumer', () => {
  const model = fixture();
  model.assumptions.holdYears = 0.5;
  model.longTerm.turnaround.enabled = true;
  model.longTerm.turnaround.stabilizedArvOverride = 200000;
  const output = calculateDeal(model).longTerm;
  assert.equal(output.saleProceeds,100000);
  assert.equal(getModeledSaleCashAtMonth(output, model, 6),100000);
});


test('Flip ROI search crosses a zero-interest HELOC-funded interval before testing invested-cash returns',()=>{
 const model=fixture();
 Object.assign(model.purchase,{purchasePrice:120000,arv:200000,rehabBudget:0,financingType:'cash',helocAmount:100000,helocRate:0,helocAmortizationType:'IO'});
 Object.assign(model.flip,{arvOverride:200000,rehabOverride:0,targetProfit:0,targetRoiPercent:0.25});
 const output=calculateDeal(model).flip;
 assert.equal(output.roi,4);
 assert.equal(output.calculationBreakdown!.flipMeta!.maxAllowableOffer,180000);
 model.purchase.purchasePrice=180000;
 assert.equal(calculateDeal(model).flip.roi,0.25);
});
