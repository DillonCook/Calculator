import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultDealInput } from '../lib/models/deal';
import { decodeDealFromShareParam, encodeDealToShareParam } from '../lib/share-link';

test('share codec round trips deal payloads', () => {
  const encoded = encodeDealToShareParam(defaultDealInput);
  assert.ok(encoded.length > 0);

  const decoded = decodeDealFromShareParam(encoded);
  assert.ok(decoded);
  assert.equal(decoded?.purchase.dealName, defaultDealInput.purchase.dealName);
  assert.equal(decoded?.airbnb.furnishingOneTime, defaultDealInput.airbnb.furnishingOneTime);
});

test('share codec rejects malformed or oversized payloads', () => {
  assert.equal(decodeDealFromShareParam('not-valid'), null);
  assert.equal(decodeDealFromShareParam('a'.repeat(10000)), null);

  const huge = {
    ...defaultDealInput,
    purchase: {
      ...defaultDealInput.purchase,
      dealName: 'X'.repeat(30000)
    }
  };

  assert.equal(encodeDealToShareParam(huge), '');
});
