import { describe, expect, it } from 'vitest';

import { defaultDealInput } from '../lib/models/deal';
import { decodeDealFromShareParam, encodeDealToShareParam } from '../lib/share-link';

describe('compact share link payload', () => {
  it('roundtrips to the same normalized deal', () => {
    const payload = {
      ...defaultDealInput,
      purchase: {
        ...defaultDealInput.purchase,
        dealName: 'Charlotte Duplex',
        purchasePrice: 365000,
        hoaMonthly: 55
      },
      longTerm: {
        ...defaultDealInput.longTerm,
        grossRentMonthly: 2950
      },
      uiState: {
        activeStrategy: 'airbnb',
        projectionStrategies: ['airbnb', 'flip']
      }
    };

    const encoded = encodeDealToShareParam(payload);
    const decoded = decodeDealFromShareParam(encoded);

    expect(encoded).not.toHaveLength(0);
    expect(decoded).toEqual(payload);
  });

  it('shortens token when values match defaults', () => {
    const encodedDefault = encodeDealToShareParam(defaultDealInput);
    const encodedChanged = encodeDealToShareParam({
      ...defaultDealInput,
      purchase: {
        ...defaultDealInput.purchase,
        purchasePrice: defaultDealInput.purchase.purchasePrice + 1
      }
    });

    expect(encodedDefault).not.toHaveLength(0);
    expect(encodedChanged).not.toHaveLength(0);
    expect(encodedDefault.length).toBeLessThan(encodedChanged.length);
  });
});
