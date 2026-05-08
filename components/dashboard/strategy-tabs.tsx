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
  longTermTurnaroundEnabled?: boolean;
  onLongTermTurnaroundChange?: (enabled: boolean) => void;
  quickScan?: {
    title: string;
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
  <div className={`panel-swap quick-scan-panel ${embedded ? 'quick-scan-panel-embedded' : 'p-3'}`}>
    <div className="quick-scan-copy">
      <div className="quick-scan-heading">
        <p className="dashboard-kicker">Quick scan</p>
        <p className="quick-scan-title">{quickScan.title}</p>
      </div>
      <ul className="quick-scan-points">
        {quickScan.points.map((point) => (
          <li key={point} className="quick-scan-point">
            <span className="quick-scan-dot" aria-hidden="true" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  </div>
);

export function TurnaroundIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 14.5h6.5a4 4 0 0 0 0-8H7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 3.5 5 6.5l3.5 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.25 12.25 16 14l-1.75 1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StrategyTabs({
  active,
  onChange,
  longTermTurnaroundEnabled = false,
  onLongTermTurnaroundChange,
  quickScan,
  actionSlot,
  embeddedInRail = false
}: StrategyTabsProps) {
  const selectLongTermMode = (turnaroundEnabled: boolean) => {
    triggerHapticFeedback('light');
    onLongTermTurnaroundChange?.(turnaroundEnabled);
    onChange('longTerm');
  };

  const strategySelector = (
    <div
      aria-label="Desktop strategy selector"
      role="group"
      className={`strategy-pill-group grid min-w-0 grid-cols-2 gap-1.5 sm:flex sm:flex-wrap ${
        embeddedInRail ? 'strategy-pill-group-embedded' : 'flex-1'
      }`}
    >
      {strategies.map((strategy) => {
        const isActive = active === strategy.key;
        if (strategy.key === 'longTerm') {
          const isRegularActive = isActive && !longTermTurnaroundEnabled;
          const isTurnaroundActive = isActive && longTermTurnaroundEnabled;

          return (
            <div
              key={strategy.key}
              className={`long-term-strategy-combo grid min-h-[2.35rem] w-full shrink-0 grid-cols-[2fr_1fr] overflow-hidden rounded-xl sm:w-auto ${
                isActive ? 'long-term-strategy-combo-active' : ''
              }`}
            >
              <button
                className={`tap-feedback btn-brand-profile btn-selector btn-selector-input min-h-[2.35rem] rounded-none px-2.5 py-1.5 text-[0.8125rem] whitespace-nowrap transition-all duration-200 ease-out ${
                  isRegularActive ? 'btn-selector-active' : ''
                }`}
                onClick={() => selectLongTermMode(false)}
                type="button"
              >
                {strategy.label}
              </button>
              <button
                className={`tap-feedback hoverbox-trigger btn-brand-profile btn-selector btn-selector-input turnaround-strategy-toggle min-h-[2.35rem] rounded-none px-2 py-1.5 text-[0.8125rem] transition-all duration-200 ease-out ${
                  isTurnaroundActive ? 'btn-selector-active turnaround-strategy-toggle-active' : ''
                }`}
                onClick={() => selectLongTermMode(true)}
                type="button"
                aria-label="Long-Term turnaround"
                aria-pressed={isTurnaroundActive}
                data-hoverbox="Turnaround"
              >
                <TurnaroundIcon className="mx-auto h-4 w-4" />
              </button>
            </div>
          );
        }

        return (
          <button
            key={strategy.key}
            className={`tap-feedback btn-brand-profile btn-selector btn-selector-input min-h-[2.35rem] w-full shrink-0 px-2.5 py-1.5 text-[0.8125rem] whitespace-nowrap transition-all duration-200 ease-out sm:w-auto ${
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
  );

  if (embeddedInRail) {
    return (
      <div className="strategy-tabs-shell strategy-tabs-shell-embedded">
        {quickScan ? <div key={`quick-scan-mobile-${quickScan.title}`} className="md:hidden"><QuickScanPanel quickScan={quickScan} /></div> : null}

        <div className="strategy-tabs-embedded-layout">
          <div className="strategy-control-row strategy-control-row-embedded flex flex-wrap items-start gap-1.5">
            {strategySelector}
          </div>

          {quickScan ? (
            <div key={`quick-scan-desktop-${quickScan.title}`} className="quick-scan-inline hidden min-w-0 md:block">
              <QuickScanPanel quickScan={quickScan} embedded />
            </div>
          ) : null}

          {actionSlot ? (
            <div className="strategy-action-slot strategy-action-slot-embedded flex items-start">
              {actionSlot}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="strategy-tabs-shell">
      {quickScan ? <div key={`quick-scan-mobile-${quickScan.title}`} className="md:hidden"><QuickScanPanel quickScan={quickScan} /></div> : null}

      <div className={embeddedInRail ? '' : 'section-shell section-shell-input rounded-2xl p-2 shadow-soft'}>
        <div className={`strategy-control-row flex flex-wrap items-stretch gap-1.5 ${embeddedInRail ? 'strategy-control-row-embedded' : ''}`}>
          {strategySelector}
          {quickScan && embeddedInRail ? (
            <div key={`quick-scan-desktop-${quickScan.title}`} className="quick-scan-inline hidden min-w-0 md:block">
              <QuickScanPanel quickScan={quickScan} embedded />
            </div>
          ) : null}
          {actionSlot ? (
            <div className={`strategy-action-slot flex items-stretch self-stretch ${embeddedInRail ? 'strategy-action-slot-embedded w-full lg:w-auto' : 'shrink-0'}`}>
              {actionSlot}
            </div>
          ) : null}
        </div>
      </div>

      {quickScan && !embeddedInRail ? <div key={`quick-scan-desktop-${quickScan.title}`} className="hidden md:block"><QuickScanPanel quickScan={quickScan} /></div> : null}
    </div>
  );
}
