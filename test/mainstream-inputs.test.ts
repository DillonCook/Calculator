import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDealInput, encodeDealToShareParam, decodeDealFromShareParam } from '@/lib/share-link';
import { defaultDealInput } from '@/lib/models/deal';
import { calculateDeal } from '@/lib/engine/deal-engine';

test('Shared financial inputs reject explicit nonnumeric and nonfinite values instead of calculating guesses',()=>{
 for(const value of ['300000',null,NaN,Infinity]) assert.equal(normalizeDealInput({purchase:{purchasePrice:value}}),null);
 assert.equal(normalizeDealInput({longTerm:{grossRentMonthly:'3000'}}),null);
 assert.equal(normalizeDealInput({purchase:{dealName:123}}),null);
});
test('Shared input limits prevent unbounded projection loops',()=>{
 assert.equal(normalizeDealInput({assumptions:{holdYears:1e9}}),null);
 assert.equal(normalizeDealInput({flip:{holdingMonths:1e9}}),null);
});
test('Financial metrics and reviewed goals survive share round trip for every strategy',()=>{
 const model=structuredClone(defaultDealInput);
 model.analysis={kind:'property',assumptionsReviewed:true,minMonthlyCashFlow:200,minDscr:1.2,lastWorkout:{purchasePrice:200000,downPaymentPercent:0.2}};
 const decoded=decodeDealFromShareParam(encodeDealToShareParam(model));
 assert.ok(decoded);
 assert.deepEqual(decoded.analysis,model.analysis);
 const before=calculateDeal(model), after=calculateDeal(decoded);
 for(const strategy of ['purchase','longTerm','airbnb','padSplit','brrrr','flip'] as const) {
  for(const key of ['monthlyCashFlow','totalCashNeeded','roi','irr','dscr'] as const) assert.equal(after[strategy][key],before[strategy][key],strategy+':'+key);
 }
});


test('Imported financing contracts reject unsupported modes and unsafe interest ranges',()=>{
 for(const value of [{purchase:{interestRate:10}},{brrrr:{refinanceRate:10}},{purchase:{ownershipMode:'mystery'}},{brrrr:{operatingStrategy:'unknown'}}]) assert.ok(normalizeDealInput(value)===null);
});
