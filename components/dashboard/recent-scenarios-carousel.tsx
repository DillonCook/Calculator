'use client';

import type { ScenarioRecord } from '@/lib/models/deal';

interface RecentScenariosCarouselProps {
  scenarios: ScenarioRecord[];
  activeDealName: string;
  onOpen: (scenarioId: string) => void;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

export function RecentScenariosCarousel({ scenarios, activeDealName, onOpen }: RecentScenariosCarouselProps) {
  if (scenarios.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-white/15 bg-panel/40 p-3 text-sm text-muted">
        Save a scenario to build your recent deal lane.
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-white">Recent Deals</h2>
        <p className="text-xs text-muted">Tap to load instantly</p>
      </div>
      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {scenarios.slice(0, 12).map((scenario) => {
          const isActive = scenario.dealName === activeDealName;
          return (
            <button
              key={scenario.scenarioId}
              type="button"
              onClick={() => onOpen(scenario.scenarioId)}
              className={`snap-start rounded-xl border px-3 py-2 text-left transition ${
                isActive ? 'border-accent/60 bg-accent/20' : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
            >
              <p className="line-clamp-1 min-w-[180px] text-sm font-medium">{scenario.dealName}</p>
              <p className="text-xs text-muted">Updated {dateFormatter.format(new Date(scenario.updatedAt))}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
