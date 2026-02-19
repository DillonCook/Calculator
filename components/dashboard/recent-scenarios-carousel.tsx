'use client';

import { useMemo } from 'react';
import type { ScenarioRecord } from '@/lib/models/deal';
import { triggerHapticFeedback } from '@/lib/use-haptics';

interface RecentScenariosCarouselProps {
  scenarios: ScenarioRecord[];
  activeDealName: string;
  onOpen: (scenarioId: string) => void;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

export function RecentScenariosCarousel({ scenarios, activeDealName, onOpen }: RecentScenariosCarouselProps) {
  const latestScenarios = useMemo(
    () => [...scenarios].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5),
    [scenarios]
  );

  if (latestScenarios.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-3 text-sm text-muted">
        Save a scenario to build your recent deal lane.
      </section>
    );
  }

  return (
    <section className="space-y-2 min-w-0">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-white">Recent Deals</h2>
        <p className="text-xs text-muted">Tap to load instantly</p>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {latestScenarios.map((scenario, index) => {
          const isActive = scenario.dealName === activeDealName;
          const hideOnSmallMobile = index >= 3;

          return (
            <button
              key={scenario.scenarioId}
              type="button"
              onClick={() => {
                triggerHapticFeedback('light');
                onOpen(scenario.scenarioId);
              }}
              className={`tap-feedback min-w-0 rounded-xl border px-3 py-2 text-left transition-all duration-200 ease-out ${
                isActive
                  ? 'accent-edge'
                  : 'border-white/10 bg-white/5 hover:bg-white/10'
              } ${hideOnSmallMobile ? 'hidden sm:block' : ''}`}
            >
              <p className="line-clamp-1 text-sm font-medium">{scenario.dealName}</p>
              <p className="text-xs text-muted">Updated {dateFormatter.format(new Date(scenario.updatedAt))}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
