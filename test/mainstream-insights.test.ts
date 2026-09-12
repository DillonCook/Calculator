import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDealInput } from '@/lib/models/deal';
import { calculateDeal } from '@/lib/engine/deal-engine';
import { getFixedCostBreakdown } from '@/lib/tax-insurance';
import { getMoneyWaterfall, getCapitalTiming, getDecisionVerdict, applySensitivity, getReturnDrivers } from '@/lib/mainstream-insights';

const rental = () => {
  const model = structuredClone(defaultDealInput);
  Object.assign(model.purchase, { purchasePrice: 100000, arv: 100000, rehabBudget: 0, financingType: 'cash', closingCostPercent: 0, helocAmount: 0, propertyTaxAnnualOverride: 0, insuranceAnnualOverride: 0, hoaMonthly: 0 });
  Object.assign(model.longTerm, { grossRentMonthly: 1000, vacancyPercent: 0.1, managementFeePercent: 0, maintenancePercent: 0, capexPercent: 0, ownerExpensesMonthly: 200 });
  Object.assign(model.assumptions, { holdYears: 1, annualAppreciationPercent: 0, sellingCostPercent: 0, noiGrowthPercent: 0 });
  model.variableExpenses = model.variableExpenses.map(e => ({...e, monthlyAmount: 0}));
  return model;
};

test('The monthly money waterfall reconciles actual income, vacancy, costs and money left', () => {
  const output = calculateDeal(rental()).longTerm;
  const rows = getMoneyWaterfall(output);
  assert.deepEqual(rows.map(r => r.amount), [1000, -100, -200, 0, 700]);
  assert.equal(rows.slice(0,-1).reduce((s,r) => s+r.amount,0), output.monthlyCashFlow);
});


test('Capital timing separates upfront cash from future operating shortfalls', () => {
  const model = rental();
  model.longTerm.grossRentMonthly = 0;
  const timing = getCapitalTiming(calculateDeal(model).longTerm);
  assert.equal(timing.upfront, 100000);
  assert.equal(timing.futureContributions, 2400);
  assert.equal(timing.refinanceCash, 0);
});



test('Positive cash flow does not mean that the users return goals were met', () => {
  const model = rental();
  model.analysis = { minMonthlyCashFlow: 900, minDscr: 1, minCashOnCashPercent: 0 };
  assert.equal(getDecisionVerdict(model, 'longTerm', calculateDeal(model).longTerm).status,'misses');
});



test('Editable downside assumptions use the engine and never modify the original deal', () => {
  const model = rental();
  const original = structuredClone(model);
  const downside = applySensitivity(model,'longTerm',{ incomePercent: -10, costPercent: 10, exitPercent: -10 });
  assert.equal(downside.model.longTerm.grossRentMonthly,900);
  assert.ok(Math.abs(downside.model.longTerm.ownerExpensesMonthly - 220) < 1e-6);
  assert.equal(downside.output.monthlyCashFlow,590);
  assert.deepEqual(model,original);
});



test('Return drivers distinguish spendable operations from paper appreciation and reconcile profit', () => {
  const model = rental();
  model.assumptions.annualAppreciationPercent = 0.1;
  const output = calculateDeal(model).longTerm;
  const drivers = getReturnDrivers(model,output);
  assert.equal(drivers[0].amount,8400);
  assert.equal(drivers[1].amount,0);
  assert.ok(Math.abs(drivers[2].amount-10000)<1e-6);
  assert.ok(Math.abs(drivers.reduce((s,r)=>s+r.amount,0)-18400)<1e-6);
});



test('Downside exit changes work when value originally falls back to purchase price',()=>{
 const model=rental();model.purchase.arv=0;model.longTerm.arvOverride=null;
 const base=calculateDeal(model).longTerm;
 const shocked=applySensitivity(model,'longTerm',{incomePercent:0,costPercent:0,exitPercent:-10});
 const baseSale=base.cashFlowEvents!.find(e=>e.category==='sale')!.amount;
 const downSale=shocked.output.cashFlowEvents!.find(e=>e.category==='sale')!.amount;
 assert.ok(downSale<baseSale);
 assert.equal(model.longTerm.arvOverride,null);
});

test('Cost stress increases estimated tax and insurance, not only entered overrides',()=>{
 const model=rental();model.purchase.propertyTaxAnnualOverride=null;model.purchase.insuranceAnnualOverride=null;
 const shocked=applySensitivity(model,'longTerm',{incomePercent:0,costPercent:10,exitPercent:0});
 assert.ok(getFixedCostBreakdown(shocked.model.purchase).propertyTaxMonthly > getFixedCostBreakdown(model.purchase).propertyTaxMonthly);
});



test('Cash shortfall at sale is disclosed separately from operating contributions',()=>{
 const output=calculateDeal(rental()).longTerm;
 output.cashFlowEvents=[{month:0,amount:-100000,category:'capital'},{month:12,amount:-5000,category:'sale'}];
 assert.equal(getCapitalTiming(output).saleShortfall,5000);
 assert.equal(getCapitalTiming(output).futureContributions,0);
});
