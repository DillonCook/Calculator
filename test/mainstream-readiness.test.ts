import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDealInput } from '@/lib/models/deal';

import { getDealReadiness } from '@/lib/deal-readiness';

test('Annual income alternatives and valid zero-interest zero-down loans unlock results', () => {
  const model = structuredClone(defaultDealInput);
  Object.assign(model.purchase, { dealName: 'Annual income', purchasePrice: 300000, financingType: 'loan', downPaymentPercent: 0, interestRate: 0 });
  Object.assign(model.longTerm, { grossRentMonthly: 0, annualRevenueOverride: 36000 });
  Object.assign(model.airbnb, { adr: 0, annualRevenueOverride: 36000 });
  Object.assign(model.padSplit, { rentableRooms: 0, avgWeeklyRatePerRoom: 0, annualRevenueOverride: 36000 });

  for (const strategy of ['longTerm', 'airbnb', 'padSplit'] as const) {
    assert.deepEqual(getDealReadiness(model, strategy).missing, []);
  }
});
