import { describe, expect, it } from 'vitest';

import { extractDealNameFromListingUrl, normalizeListingUrl } from '../lib/listing-link';

describe('listing link parsing', () => {
  it('extracts a friendly deal name from a zillow-style URL slug', () => {
    const name = extractDealNameFromListingUrl('https://www.zillow.com/homedetails/123-Main-St-Tampa-FL-33602/12345_zpid/');
    expect(name).toBe('123 Main St, Tampa');
  });

  it('normalizes host-only links with a missing protocol', () => {
    expect(normalizeListingUrl('www.zillow.com/homedetails/123-Main-St-Tampa-FL-33602/')).toBe(
      'https://www.zillow.com/homedetails/123-Main-St-Tampa-FL-33602/'
    );
  });
});
