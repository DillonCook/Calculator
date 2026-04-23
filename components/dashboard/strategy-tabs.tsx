import type { ReactNode } from 'react';

import type { StrategyKey } from '@/lib/models/deal';
import { triggerHapticFeedback } from '@/lib/use-haptics';

const strategies: { key: StrategyKey; label: string }[] = [
  { key: 'purchase', label: 'Commercial' },
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
  embeddedInRail?: boolean;
}

const QuickScanPanel = ({
  quickScan,
  embedded = false
}: {
  quickScan: NonNullable<StrategyTabsProps['quickScan']>;
  embedded?: boolean;
}) => (
  <div className={`panel-swap quick-scan-panel p-3 ${embedded ? 'quick-scan-panel-embedded' : ''}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="dashboard-kicker">Quick scan</p>
        <p className="text-base font-semibold sm:text-lg">{quickScan.title}</p>
      </div>
      <p className="dashboard-meta max-w-xl text-xs sm:text-sm">{quickScan.notes}</p>
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

export function StrategyTabs({ active, onChange, quickScan, actionSlot, embeddedInRail = false }: StrategyTabsProps) {
  return (
    <div className="strategy-tabs-shell">
      {quickScan ? <div key={`quick-scan-mobile-${quickScan.title}`} className="md:hidden"><QuickScanPanel quickScan={quickScan} /></div> : null}

      <div className={embeddedInRail ? '' : 'section-shell section-shell-input rounded-2xl p-2 shadow-soft'}>
        <div className="flex flex-wrap items-stretch gap-2">
          <div aria-label="Desktop strategy selector" role="group" className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {strategies.map((strategy) => {
              const isActive = active === strategy.key;
              return (
                <button
                  key={strategy.key}
                  className={`tap-feedback btn-brand-profile btn-selector btn-selector-input min-h-[2.625rem] w-full px-4 py-2 text-sm transition-all duration-200 ease-out sm:w-auto ${
                    isActive ? 'btn-selector-active' : ''
                  }`}
                  onClick={() => {
                    triggerHapticFeedback('light');
                    onChange(strategy.key);
                  }}
                  type="button"
                >
                  {strategy.label}
                </button>
              );
            })}
          </div>
          {actionSlot ? <div className={`flex items-stretch ${embeddedInRail ? 'w-full lg:ml-auto lg:w-auto' : 'shrink-0'}`}>{actionSlot}</div> : null}
        </div>
      </div>

      {quickScan ? <div key={`quick-scan-desktop-${quickScan.title}`} className="hidden md:block"><QuickScanPanel quickScan={quickScan} embedded={embeddedInRail} /></div> : null}
    </div>
  );
}
