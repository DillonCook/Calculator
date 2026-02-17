import type { StrategyKey } from '@/lib/models/deal';

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
          className={`snap-start rounded-xl px-4 py-2 text-sm font-medium transition ${
            active === strategy.key ? 'bg-accent text-white' : 'bg-white/5 text-muted hover:bg-white/10'
          }`}
          onClick={() => onChange(strategy.key)}
          type="button"
        >
          {strategy.label}
        </button>
      ))}
    </div>
  );
}
