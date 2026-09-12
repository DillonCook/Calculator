import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { defaultDealInput } from '@/lib/models/deal';
import { buildDealWorkoutRecommendation } from '@/lib/engine/deal-workout';

test('Weak rental recommendations do not run nested full-deal solvers', () => {
  const model = structuredClone(defaultDealInput);
  Object.assign(model.purchase, { purchasePrice: 300000 });
  model.longTerm.grossRentMonthly = 1200;
  const start = performance.now();
  const output = buildDealWorkoutRecommendation(model, 'longTerm');
  const ms = performance.now() - start;
  console.log(JSON.stringify({ weakRentalRecommendationMs: ms, scenarios: output.scenarios.length }));
  assert.ok(ms < 500, `Recommendation blocked for ${ms.toFixed(0)}ms`);
});
