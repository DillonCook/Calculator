import type { StrategyKey } from '@/lib/models/deal';
import { triggerHapticFeedback } from '@/lib/use-haptics';

const strategies: { key: StrategyKey; label: string }[] = [
  { key: 'purchase', label: 'Purchase' },
  { key: 'longTerm', label: 'Long-Term' },
  { key: 'airbnb', label: 'Airbnb' },
  { key: 'padSplit', label: 'PadSplit' },
  { key: 'brrrr', label: 'BRRRR' },
  { key: 'flip', label: 'Flip' }
];

interface StrategyTabsProps {
  active: StrategyKey;
  onChange: (key: StrategyKey) => void;
}

export function StrategyTabs({ active, onChange }: StrategyTabsProps) {
  return (
    <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2">
      {strategies.map((strategy) => (
        <button
          key={strategy.key}
          className={`tap-feedback snap-start rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ease-out ${
            active === strategy.key
              ? 'accent-edge text-white'
              : 'bg-white/5 text-muted hover:bg-white/12'
          }`}
          onClick={() => {
            triggerHapticFeedback('light');
            onChange(strategy.key);
          }}
          type="button"
        >
          {strategy.label}
        </button>
      ))}
    </div>
  );
}
