import {applySensitivity} from '@/lib/mainstream-insights';
import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultDealInput} from '@/lib/models/deal';
import {calculateDeal} from '@/lib/engine/deal-engine';
import {getDealReadiness} from '@/lib/deal-readiness';
import {normalizeDealInput} from '@/lib/share-link';
import {getModeledSaleCashAtMonth} from '@/lib/projection-metrics';
const fixture=()=>{const m=structuredClone(defaultDealInput);m.purchase.dealName='Audit fixture';m.longTerm.grossRentMonthly=3000;return m;};
test('Active invalid debt terms cannot pass readiness or import validation',()=>{
 for(const term of [0,-1,0.001,101,NaN]) {
  const m=fixture();m.purchase.loanTermYears=term;
  assert.equal(getDealReadiness(m,'longTerm').ready,false,`term ${term}`);
  assert.equal(normalizeDealInput(m),null);
 }
 const heloc=fixture();heloc.purchase.financingType='cash';heloc.purchase.helocAmount=10000;heloc.purchase.helocTermYears=0;
 assert.equal(getDealReadiness(heloc,'longTerm').ready,false);assert.equal(normalizeDealInput(heloc),null);
 const owned=fixture();owned.purchase.ownershipMode='owned';owned.purchase.existingMortgageBalance=100000;owned.purchase.existingMortgageRemainingYears=0;
 assert.equal(getDealReadiness(owned,'longTerm').ready,false);assert.equal(normalizeDealInput(owned),null);
});
test('Zero APR/down and unused debt terms remain valid',()=>{
 const m=fixture();m.purchase.interestRate=0;m.purchase.downPaymentPercent=0;
 assert.equal(getDealReadiness(m,'longTerm').ready,true);assert.ok(normalizeDealInput(m));
 m.purchase.financingType='cash';m.purchase.loanTermYears=0;m.purchase.helocTermYears=0;
 assert.equal(getDealReadiness(m,'longTerm').ready,true);assert.ok(normalizeDealInput(m));
});
test('Supported half-year debt uses the same payment and payoff in projections',()=>{
 const m=fixture();m.purchase.loanTermYears=.5;m.assumptions.holdYears=.25;
 const o=calculateDeal(m).longTerm;
 assert.ok(Math.abs(o.cashFlowEvents!.find(e=>e.category==='operating')!.amount-o.monthlyCashFlow)<1e-6);
 assert.ok(Math.abs(getModeledSaleCashAtMonth(o,m,3)-o.saleProceeds!)<1e-6);
});

test('Cost shocks cover individual operating costs and BRRRR operating variants',()=>{
 for(const strategy of ['padSplit','brrrr'] as const) {
  const m=fixture();m.brrrr.operatingStrategy='padSplit';
  Object.assign(m.padSplit,{ownerExpensesMonthly:1000,propertyManagementFeeMonthly:200,turnoverCostPerMoveOut:40});
  const changed=applySensitivity(m,strategy,{incomePercent:0,costPercent:100,exitPercent:0});
  assert.equal(changed.model.padSplit.ownerExpensesMonthly,2000);
  assert.equal(changed.model.padSplit.propertyManagementFeeMonthly,400);
  assert.equal(changed.model.padSplit.turnoverCostPerMoveOut,80);
 }
 const m=fixture();m.longTerm.turnaround.annualTaxInsuranceAdjustment=1200;
 assert.equal(applySensitivity(m,'longTerm',{incomePercent:0,costPercent:100,exitPercent:0}).model.longTerm.turnaround.annualTaxInsuranceAdjustment,2400);
 const commercial=applySensitivity(m,'purchase',{incomePercent:100,costPercent:100,exitPercent:0}).model;
 assert.equal(commercial.commercial.nnnRecoveryPerSqftYear,m.commercial.nnnRecoveryPerSqftYear*2);
 assert.equal(commercial.commercial.tenantImprovementsReservePerSqftYear,m.commercial.tenantImprovementsReservePerSqftYear*2);
 assert.equal(commercial.commercial.leasingCommissionsReservePerSqftYear,m.commercial.leasingCommissionsReservePerSqftYear*2);
});

test('Exit shocks use actual sale phase without altering acquisition funding',()=>{
 for(const hold of [.5,1,2]) for(const ownership of ['purchase','owned'] as const) {
  const m=fixture();Object.assign(m.purchase,{ownershipMode:ownership,purchasePrice:100000,ownedPurchasePrice:100000,ownedMoneyDown:100000,arv:100000,financingType:'cash',rehabBudget:0,helocAmount:0});
  Object.assign(m.longTerm.turnaround,{enabled:true,stabilizedGrossRentMonthly:2000,stabilizedArvOverride:200000});
  Object.assign(m.assumptions,{holdYears:hold,sellingCostPercent:0,annualAppreciationPercent:0});
  const base=calculateDeal(m).longTerm;
  const changed=applySensitivity(m,'longTerm',{incomePercent:0,costPercent:0,exitPercent:-50});
  assert.equal(changed.output.saleProceeds,base.saleProceeds!/2,`${ownership} ${hold}`);
  assert.equal(getModeledSaleCashAtMonth(changed.output,changed.model,hold*12),changed.output.saleProceeds);
  assert.equal(changed.model.purchase.purchasePrice,m.purchase.purchasePrice);
  assert.equal(changed.output.totalCashNeeded,base.totalCashNeeded);
  assert.equal(changed.output.monthlyCashFlow,base.monthlyCashFlow);
 }
});

test('Active refinance terms and one-month purchase terms follow the same contract',()=>{
 const m=fixture();m.purchase.loanTermYears=1/12;
 assert.equal(getDealReadiness(m,'longTerm').ready,true);
 m.brrrr.arvOverride=300000;m.brrrr.refinanceTermYears=0;
 assert.equal(getDealReadiness(m,'brrrr').ready,false);
 m.brrrr.refinanceLtvPercent=0;
 assert.equal(getDealReadiness(m,'brrrr').ready,true);
});
test('Expanded cost and income stress leaves original records and financing unchanged',()=>{
 const m=fixture();Object.assign(m.longTerm.turnaround,{laundryIncomeMonthly:10,vendingMiscIncomeMonthly:20,garageIncomeMonthly:30,parkingIncomeMonthly:40,additionalIncomeMonthly:50});m.purchase.pmiMonthly=100;
 const before=structuredClone(m), changed=applySensitivity(m,'longTerm',{incomePercent:100,costPercent:100,exitPercent:0}).model;
 for(const key of ['laundryIncomeMonthly','vendingMiscIncomeMonthly','garageIncomeMonthly','parkingIncomeMonthly','additionalIncomeMonthly'] as const)assert.equal(changed.longTerm.turnaround[key],m.longTerm.turnaround[key]*2);
 assert.equal(changed.purchase.pmiMonthly,200);assert.equal(changed.purchase.interestRate,m.purchase.interestRate);assert.deepEqual(m,before);
 const brrrr=applySensitivity(m,'brrrr',{incomePercent:0,costPercent:100,exitPercent:0}).model;
 assert.equal(brrrr.brrrr.holdingExpensesMonthly,m.brrrr.holdingExpensesMonthly*2);
});

test('STR income stress includes charged cleaning revenue',()=>{
 const m=fixture();m.airbnb.adr=200;
 const changed=applySensitivity(m,'airbnb',{incomePercent:100,costPercent:0,exitPercent:0});
 assert.equal(changed.output.calculationBreakdown!.revenueMonthly,calculateDeal(m).airbnb.calculationBreakdown!.revenueMonthly*2);
});
