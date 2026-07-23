import { describe, expect, it } from 'vitest';
import { getMarketingAttributionFromSearch, removeMarketingParamsFromUrl } from '../lib/marketing-attribution';

describe('marketing attribution', () => {
  it('keeps only allowlisted marketing parameters from the landing site', () => {
    expect(
      getMarketingAttributionFromSearch('?utm_source=dealcooker_landing&utm_medium=organic&utm_campaign=homepage_cta&utm_content=hero&strategy=airbnb&email=private%40example.com&s=share-token')
    ).toEqual({
      source: 'dealcooker_landing',
      medium: 'organic',
      campaign: 'homepage_cta',
      content: 'hero',
      strategy: 'airbnb'
    });
  });

  it('normalizes and bounds values without throwing', () => {
    expect(getMarketingAttributionFromSearch(`?utm_source=${'x'.repeat(200)}&utm_medium=%20organic%20`)).toEqual({
      source: 'x'.repeat(80),
      medium: 'organic'
    });
    expect(getMarketingAttributionFromSearch('not a query')).toEqual({});
    expect(getMarketingAttributionFromSearch('?utm_source=dealcooker_landing&strategy=Airbnb')).toEqual({ source: 'dealcooker_landing' });
  });

  it('removes only landing attribution keys while preserving app state and hashes', () => {
    expect(
      removeMarketingParamsFromUrl('https://www.dealcooker.app/?utm_source=dealcooker_landing&utm_medium=organic&utm_campaign=rental&utm_content=hero&strategy=longTerm&s=shared&authMode=password-reset&other=kept#result')
    ).toBe('https://www.dealcooker.app/?s=shared&authMode=password-reset&other=kept#result');
  });
});
