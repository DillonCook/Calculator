'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DealInputPanel } from '@/components/dashboard/deal-input-panel';
import { ScenarioToolbar } from '@/components/dashboard/scenario-toolbar';
import { StrategyBreakdown } from '@/components/dashboard/strategy-breakdown';
import { StrategyComparison } from '@/components/dashboard/strategy-comparison';
import { StrategyTabs } from '@/components/dashboard/strategy-tabs';
import { TimelineCard } from '@/components/dashboard/timeline-card';
import { KpiCard } from '@/components/ui/kpi-card';
import { calculateDeal } from '@/lib/engine/deal-engine';
import { defaultDealInput, type StrategyKey } from '@/lib/models/deal';
import { createScenarioRecord, encodeScenario } from '@/lib/scenario-storage';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

export default function HomePage() {
  const [model, setModel] = useState(defaultDealInput);
  const [activeStrategy, setActiveStrategy] = useState<StrategyKey>('longTerm');

  const result = useMemo(() => calculateDeal(model), [model]);
  const exportPayload = useMemo(() => encodeScenario(createScenarioRecord(model)), [model]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0B1220] via-[#0F1B33] to-[#101B32] px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-2xl border border-white/10 bg-panel/80 p-5 shadow-soft backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-accent">Investor Command Center</p>
              <h1 className="text-2xl font-semibold md:text-3xl">Master Summary Dashboard</h1>
              <p className="text-sm text-muted">Instant underwriting across Purchase, LT, STR, PadSplit, BRRRR, and Flip.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-right">
                <p className="text-xs text-muted">Active Deal</p>
                <p className="text-sm font-medium">{model.purchase.dealName}</p>
              </div>
              <Link
                href={`/print?scenario=${exportPayload}`}
                className="rounded-xl border border-accent/60 bg-accent/20 px-3 py-2 text-sm font-medium text-accent"
                target="_blank"
              >
                Print View
              </Link>
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard label="Cash to Close" value={currency.format(result.masterSummary.cashToClose)} helper="Down payment + closing + points + rehab" />
          <KpiCard label="Best Monthly Cash Flow" value={currency.format(result.masterSummary.monthlyCashFlow)} tone="success" />
          <KpiCard label="Best Cash on Cash" value={percent.format(result.masterSummary.cashOnCashReturn)} />
          <KpiCard label="Best DSCR" value={Math.max(result.longTerm.dscr, result.airbnb.dscr, result.padSplit.dscr, result.brrrr.dscr).toFixed(2)} />
          <KpiCard label="Best ROI" value={percent.format(result.masterSummary.roi)} />
          <KpiCard label="Best IRR" value={percent.format(result.masterSummary.irr)} helper="Calculated from yearly cashflow timeline" />
        </section>

        <ScenarioToolbar model={model} onLoadScenario={setModel} />

        <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <StrategyTabs active={activeStrategy} onChange={setActiveStrategy} />
            <StrategyBreakdown data={result} active={activeStrategy} />
            <TimelineCard
              output={result[activeStrategy]}
              holdYears={model.assumptions.holdYears}
              onHoldYearsChange={(years) =>
                setModel((current) => ({ ...current, assumptions: { ...current.assumptions, holdYears: years } }))
              }
            />
            <StrategyComparison data={result} />
          </div>

          <DealInputPanel value={model} onChange={setModel} />
        </div>
      </div>
    </main>
  );
}
