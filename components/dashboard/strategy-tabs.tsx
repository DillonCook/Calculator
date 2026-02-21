import type { ReactNode } from 'react';

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
  quickScan?: {
    title: string;
    notes: string;
    points: string[];
  };
  actionSlot?: ReactNode;
}

const QuickScanPanel = ({ quickScan }: { quickScan: NonNullable<StrategyTabsProps['quickScan']> }) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted">Quick scan</p>
        <p className="text-base font-semibold sm:text-lg">{quickScan.title}</p>
      </div>
      <p className="max-w-xl text-xs text-muted sm:text-sm">{quickScan.notes}</p>
    </div>
    <ul className="mt-2.5 space-y-1 text-xs text-slate-200 sm:text-sm">
      {quickScan.points.map((point) => (
        <li key={point} className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
          <span>{point}</span>
        </li>
      ))}
    </ul>
  </div>
);

export function StrategyTabs({ active, onChange, quickScan, actionSlot }: StrategyTabsProps) {
  return (
    <div className="space-y-2">
      {quickScan ? <div className="md:hidden"><QuickScanPanel quickScan={quickScan} /></div> : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {strategies.map((strategy) => (
            <button
              key={strategy.key}
              className={`tap-feedback w-full rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ease-out sm:w-auto ${
                active === strategy.key ? 'accent-edge text-white' : 'bg-white/5 text-muted hover:bg-white/12'
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
        {actionSlot ? <div className="shrink-0 self-start">{actionSlot}</div> : null}
      </div>

      {quickScan ? <div className="hidden md:block"><QuickScanPanel quickScan={quickScan} /></div> : null}
    </div>
  );
}
