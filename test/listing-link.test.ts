import { describe, expect, it } from 'vitest';

import {
  extractDealNameFromListingHtml,
  extractDealNameFromListingUrl,
  isOneHomeUrl,
  normalizeListingUrl
} from '../lib/listing-link';

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

  it('recognizes onehome urls to skip automatic renaming', () => {
    expect(isOneHomeUrl('https://portal.onehome.com/en-US/share/2478045G14539')).toBe(true);
    expect(isOneHomeUrl('https://www.zillow.com/homedetails/123-Main-St-Tampa-FL-33602/12345_zpid/')).toBe(false);
  });

  it('extracts address from listing page html metadata', () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="For Sale: 412 Oak Ave, Orlando, FL 32801 | OneHome" />
        </head>
      </html>
    `;

    expect(extractDealNameFromListingHtml(html)).toBe('412 Oak Ave, Orlando');
  });
});
