'use client';

import Link from 'next/link';
import { useMemo, useState, type ChangeEvent } from 'react';
import { DealInputPanel } from '@/components/dashboard/deal-input-panel';
import { RecentScenariosCarousel } from '@/components/dashboard/recent-scenarios-carousel';
import { ScenarioCorner } from '@/components/dashboard/scenario-corner';
import { StrategyBreakdown } from '@/components/dashboard/strategy-breakdown';
import { StrategyComparison } from '@/components/dashboard/strategy-comparison';
import { StrategyModuleInputs } from '@/components/dashboard/strategy-module-inputs';
import { StrategyTabs } from '@/components/dashboard/strategy-tabs';
import { TimelineCard } from '@/components/dashboard/timeline-card';
import { KpiCard } from '@/components/ui/kpi-card';
import { calculateDeal } from '@/lib/engine/deal-engine';
import { defaultDealInput, type DealInputModel, type ScenarioRecord, type StrategyKey } from '@/lib/models/deal';
import { createScenarioRecord, deleteScenario, encodeScenario, readScenarios, upsertScenario } from '@/lib/scenario-storage';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

export default function HomePage() {
  const [model, setModel] = useState(defaultDealInput);
  const [activeStrategy, setActiveStrategy] = useState<StrategyKey>('longTerm');
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>(() => readScenarios());
  const [selectedScenarioId, setSelectedScenarioId] = useState('');

  const result = useMemo(() => calculateDeal(model), [model]);
  const exportPayload = useMemo(() => encodeScenario(createScenarioRecord(model)), [model]);

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
          <KpiCard label="Cash to Close" value={currency.format(result.masterSummary.cashToClose)} helper="Down payment + closing + points + rehab" />
          <KpiCard label="Best Monthly Cash Flow" value={currency.format(result.masterSummary.monthlyCashFlow)} tone="success" />
          <KpiCard label="Best Cash on Cash" value={percent.format(result.masterSummary.cashOnCashReturn)} />
          <KpiCard label="Best DSCR" value={Math.max(result.longTerm.dscr, result.airbnb.dscr, result.padSplit.dscr, result.brrrr.dscr).toFixed(2)} />
          <KpiCard label="Best ROI" value={percent.format(result.masterSummary.roi)} />
          <KpiCard label="Best IRR" value={percent.format(result.masterSummary.irr)} helper="Calculated from yearly cashflow timeline" />
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <StrategyTabs active={activeStrategy} onChange={setActiveStrategy} />
            <section className="grid gap-3 xl:grid-cols-2">
              <StrategyModuleInputs active={activeStrategy} model={model} onChange={setModel} />
              <StrategyBreakdown data={result} active={activeStrategy} />
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
    </main>
  );
}
