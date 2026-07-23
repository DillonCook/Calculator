import { isStrategyKey, type StrategyKey } from './models/deal';

export type MarketingAttribution = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  strategy?: StrategyKey;
};

const fields = [
  ['utm_source', 'source'],
  ['utm_medium', 'medium'],
  ['utm_campaign', 'campaign'],
  ['utm_content', 'content']
] as const;
const marketingQueryKeys = [...fields.map(([queryKey]) => queryKey), 'strategy'];

const normalize = (value: string | null) => value?.trim().slice(0, 80) || undefined;

export const getMarketingAttributionFromSearch = (search: string): MarketingAttribution => {
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const attribution = Object.fromEntries(
      fields.flatMap(([queryKey, propertyKey]) => {
        const value = normalize(params.get(queryKey));
        return value ? [[propertyKey, value]] : [];
      })
    ) as MarketingAttribution;
    const strategy = params.get('strategy');
    if (attribution.source === 'dealcooker_landing' && isStrategyKey(strategy)) attribution.strategy = strategy;
    return attribution;
  } catch {
    return {};
  }
};

export const removeMarketingParamsFromUrl = (url: string) => {
  const next = new URL(url);
  marketingQueryKeys.forEach((key) => next.searchParams.delete(key));
  return next.toString();
};
