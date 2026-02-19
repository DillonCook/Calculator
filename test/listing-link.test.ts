import { describe, expect, it } from 'vitest';

import {
  extractDealNameFromListingHtml,
  extractDealNameFromListingUrl,
  extractDealNameFromOneHomeEmailToken,
  extractOneHomeSetIdFromEmailToken,
  extractOneHomeSetIdFromShareCode,
  extractOneHomeShareCode,
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




  it('extracts OneHome share code from portal links', () => {
    expect(extractOneHomeShareCode('https://portal.onehome.com/en-US/share/2478045G14539')).toBe('2478045G14539');
  });

  it('derives a deterministic deal name from OneHome email token payload', () => {
    const token =
      'eyJPU04iOiJTVEVMTEFSIiwiYWdlbnRpZCI6IjUyNjU3Iiwic2V0aWQiOiAiMjQ3ODA0NSIsInNldFR5cGUiOiAiUFJPUEVSVFkiLCJzYXZlZFNlYXJjaElkIjogIjViYjU0MmVmLTdmZDUtM2I3My1iNGYzLWJjMDkwMjA4ZWEwMyIsImVtYWlsIjogIiIsICJWaWV3TW9kZSI6ICIzIn0=';

    expect(extractDealNameFromOneHomeEmailToken(token)).toBe('OneHome Listing 2478045');
  });





  it('extracts OneHome set id from share code format', () => {
    expect(extractOneHomeSetIdFromShareCode('2478043G11148')).toBe('2478043');
  });

  it('extracts OneHome set id from email token payload', () => {
    const token =
      'eyJPU04iOiJTVEVMTEFSIiwiYWdlbnRpZCI6IjUyNjU3Iiwic2V0aWQiOiAiMjQ3ODA0MyIsInNldFR5cGUiOiAiUFJPUEVSVFkiLCJzYXZlZFNlYXJjaElkIjogIjcyNzI5MzYyLTYzY2UtMzc4MS1iNTRjLTcwZTkyNjNhYTBlZCIsImVtYWlsIjogIiIsICJWaWV3TW9kZSI6ICIzIn0=';

    expect(extractOneHomeSetIdFromEmailToken(token)).toBe('2478043');
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
