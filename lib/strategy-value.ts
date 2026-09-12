import type { DealInputModel } from '@/lib/models/deal';
export function resolveStrategyValue(input: DealInputModel, strategy: 'longTerm' | 'airbnb' | 'padSplit' | 'brrrr' | 'flip'): number | null {
  const value = input[strategy].arvOverride ?? (strategy === 'brrrr' ? null : input.purchase.arv);
  return value !== null && Number.isFinite(value) && value > 0 ? value : null;
}
