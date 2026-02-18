'use client';

import Link from 'next/link';
import { useMemo, useState, type ChangeEvent } from 'react';
import { DealInputPanel } from '@/components/dashboard/deal-input-panel';
import { RecentScenariosCarousel } from '@/components/dashboard/recent-scenarios-carousel';
import { ScenarioCorner } from '@/components/dashboard/scenario-corner';
import { StrategyComparison } from '@/components/dashboard/strategy-comparison';
import { StrategyModuleInputs } from '@/components/dashboard/strategy-module-inputs';
import { StrategyTabs } from '@/components/dashboard/strategy-tabs';
import { StrategyWorkLightbox } from '@/components/dashboard/strategy-work-lightbox';
import { TimelineCard } from '@/components/dashboard/timeline-card';
import { KpiCard } from '@/components/ui/kpi-card';
import { calculateDeal } from '@/lib/engine/deal-engine';
import { defaultDealInput, type DealInputModel, type ScenarioRecord, type StrategyKey } from '@/lib/models/deal';
import { createScenarioRecord, deleteScenario, encodeScenario, readScenarios, upsertScenario } from '@/lib/scenario-storage';

import { currencyFormatter, percentFormatter } from '@/lib/formatters';


const activeStrategyLabels: Record<StrategyKey, string> = {
  purchase: 'Purchase',
  longTerm: 'Long-Term',
  airbnb: 'Airbnb',
  padSplit: 'PadSplit',
  brrrr: 'BRRRR',
  flip: 'Flip'
};

const quickScanDetails: Record<StrategyKey, string[]> = {
  purchase: [
    'Baseline acquisition assumptions and financing setup for all strategy models.',
    'Use this as your foundation before choosing a strategy-specific operating plan.'
  ],
  longTerm: [
    'Stable buy-and-hold model with lower operational churn.',
    'Prioritizes predictable occupancy and durable cashflow over peak upside.'
  ],
  airbnb: [
    'Higher upside from nightly rates with more active management.',
    'Performance is most sensitive to occupancy, turns, and platform fee control.'
  ],
  padSplit: [
    'Room-by-room strategy to maximize revenue per property footprint.',
    'Execution quality on occupancy and turnover cadence heavily drives returns.'
  ],
  brrrr: [
    'Refi-driven strategy focused on capital recycling after stabilization.',
    'Best outcomes depend on renovation execution and refinance terms.'
  ],
  flip: [
    'Value-add renovation and resale model focused on execution speed.',
    'Timeline discipline and exit pricing accuracy are the core profit levers.'
  ]
};


export default function HomePage() {
  const [model, setModel] = useState(defaultDealInput);
  const [activeStrategy, setActiveStrategy] = useState<StrategyKey>('longTerm');
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>(() => readScenarios());
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [isStrategyWorkOpen, setIsStrategyWorkOpen] = useState(false);

  const result = useMemo(() => calculateDeal(model), [model]);
  const exportPayload = useMemo(() => encodeScenario(createScenarioRecord(model)), [model]);

  const activeOutput = result[activeStrategy];
  const activeStrategyLabel = activeStrategyLabels[activeStrategy];
  const quickScanPoints = quickScanDetails[activeStrategy];
  const isFlipStrategy = activeStrategy === 'flip';
  const priorityMetricLabel = isFlipStrategy ? 'Net Profit' : 'Monthly Cash Flow';
  const priorityMetricHelper = isFlipStrategy
    ? 'Flip strategy realizes profit at resale, so operating cash flow is modeled as $0'
    : 'Monthly cash flow for the selected strategy';
  const priorityMetricValue = isFlipStrategy ? activeOutput.saleProceeds ?? 0 : activeOutput.monthlyCashFlow;

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.scenarioId === selectedScenarioId),
    [scenarios, selectedScenarioId]
  );

  const loadScenario = (payload: DealInputModel, scenarioId?: string) => {
    setModel(payload);
    if (scenarioId) setSelectedScenarioId(scenarioId);
  };

  const saveScenario = () => {
    const existing = scenarios.find((scenario) => scenario.dealName === model.purchase.dealName);
    const record = createScenarioRecord(model, existing ? { ...existing, payload: model, dealName: model.purchase.dealName } : undefined);
    const next = upsertScenario(record);
    setScenarios(next);
    setSelectedScenarioId(record.scenarioId);
  };

  const openRecentScenario = (scenarioId: string) => {
    const scenario = scenarios.find((entry) => entry.scenarioId === scenarioId);
    if (!scenario) return;
    loadScenario(scenario.payload, scenario.scenarioId);
  };

  const loadSelectedScenario = () => {
    if (!selectedScenario) return;
    loadScenario(selectedScenario.payload, selectedScenario.scenarioId);
  };

  const removeScenario = () => {
    if (!selectedScenario) return;
    const next = deleteScenario(selectedScenario.scenarioId);
    setScenarios(next);
    setSelectedScenarioId('');
  };

  const exportSelectedScenario = () => {
    const record = selectedScenario ?? createScenarioRecord(model);
    const encoded = encodeScenario(record);
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${record.dealName.replace(/\s+/g, '-').toLowerCase()}-scenario.json`;
    anchor.click();
    URL.revokeObjectURL(url);

    navigator.clipboard.writeText(encoded).catch(() => {
      // noop clipboard fallback
    });
  };

  const importScenario = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const parsed = JSON.parse(text) as ScenarioRecord;
    const next = upsertScenario(parsed);
    const imported = next.find((record) => record.scenarioId === parsed.scenarioId);
    setScenarios(next);
    setSelectedScenarioId(parsed.scenarioId);
    if (imported) loadScenario(imported.payload, imported.scenarioId);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0B1220] via-[#0F1B33] to-[#101B32] px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-2xl border border-white/10 bg-panel/80 p-5 shadow-soft backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-accent">Investor Command Center</p>
              <h1 className="text-2xl font-semibold md:text-3xl">Master Summary Dashboard</h1>
              <p className="text-sm text-muted">Instant underwriting across Purchase, LT, STR, PadSplit, BRRRR, and Flip.</p>
            </div>
            <div className="w-full space-y-2 sm:w-auto sm:min-w-[320px]">
              <div className="flex items-center justify-end gap-2">
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
              <ScenarioCorner
                scenarios={scenarios}
                selectedId={selectedScenarioId}
                onSelectedIdChange={setSelectedScenarioId}
                onSave={saveScenario}
                onLoad={loadSelectedScenario}
                onExport={exportSelectedScenario}
                onDelete={removeScenario}
                onImport={importScenario}
              />
            </div>
          </div>
        </header>

        <RecentScenariosCarousel scenarios={scenarios} activeDealName={model.purchase.dealName} onOpen={openRecentScenario} />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard
            label="Cash to Close"
            value={currencyFormatter.format(result.purchase.totalCashNeeded)}
            winner={activeStrategyLabel}
            secondaryLabel="Total cash invested"
            secondaryValue={currencyFormatter.format(activeOutput.totalCashNeeded)}
            definitions={[
              {
                term: 'Cash to Close',
                description: 'Cash required at the closing table before post-close improvements.'
              },
              {
                term: 'Total cash invested',
                description: 'Full out-of-pocket capital including rehab and one-time strategy setup costs.'
              }
            ]}
          />
          <KpiCard
            label="Cap Rate"
            value={percentFormatter.format(activeOutput.capRate)}
            helper="Annual NOI ÷ current property value"
            winner={activeStrategyLabel}
          />
          <KpiCard
            label="Cash on Cash"
            value={percentFormatter.format(activeOutput.cashOnCashReturn)}
            helper="Annual cash flow ÷ total cash invested"
            winner={activeStrategyLabel}
          />
          <KpiCard
            label="DSCR"
            value={activeOutput.dscr.toFixed(2)}
            helper="NOI ÷ annual debt service"
            winner={activeStrategyLabel}
          />
          <KpiCard
            label="ROI"
            value={percentFormatter.format(activeOutput.roi)}
            helper="Total profit ÷ total cash invested"
            winner={activeStrategyLabel}
          />
          <KpiCard
            label="IRR"
            value={percentFormatter.format(activeOutput.irr)}
            helper="Discounted return from yearly cashflow timeline"
            winner={activeStrategyLabel}
          />
        </section>
        <section className="rounded-2xl border border-accent/35 bg-gradient-to-r from-accent/10 via-accent/5 to-transparent p-4 shadow-soft">
          <div className="grid gap-3 lg:grid-cols-[1fr_1.1fr] lg:items-stretch">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-accent">{priorityMetricLabel}</p>
                  <p className="mt-1 text-sm text-muted">{priorityMetricHelper}</p>
                </div>
                <p className="text-xs italic tracking-wide text-accent/90" aria-label={`${priorityMetricLabel} strategy context`}>{activeStrategyLabel}</p>
              </div>
              <p
                className={`mt-2 text-4xl font-semibold sm:text-5xl ${priorityMetricValue >= 0 ? 'text-emerald-300' : 'text-white'}`}
                data-testid="kpi-priority-metric"
              >
                {currencyFormatter.format(priorityMetricValue)}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Quick scan</p>
                  <p className="text-xl font-semibold">{activeStrategyLabel}</p>
                </div>
                <p className="max-w-xl text-sm text-muted">{activeOutput.notes}</p>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm text-slate-200">
                {quickScanPoints.map((point) => (
                  <li key={point} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>


        <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <StrategyTabs active={activeStrategy} onChange={setActiveStrategy} />
              </div>
              <button
                type="button"
                onClick={() => setIsStrategyWorkOpen(true)}
                className="rounded-xl border border-accent/50 bg-accent/10 px-3 py-2 text-sm font-medium text-accent transition hover:bg-accent/20"
              >
                Show work
              </button>
            </div>
            <section className="grid gap-3">
              <StrategyModuleInputs active={activeStrategy} model={model} onChange={setModel} />
            </section>
            <TimelineCard
              output={result[activeStrategy]}
              assumptions={model.assumptions}
              onAssumptionsChange={(updates) =>
                setModel((current) => ({ ...current, assumptions: { ...current.assumptions, ...updates } }))
              }
            />
            <StrategyComparison data={result} />
          </div>

          <DealInputPanel value={model} onChange={setModel} />
        </div>
      </div>
      <StrategyWorkLightbox
        open={isStrategyWorkOpen}
        activeStrategy={activeStrategy}
        output={activeOutput}
        onClose={() => setIsStrategyWorkOpen(false)}
      />
    </main>
  );
}
