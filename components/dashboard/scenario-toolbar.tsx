'use client';

import { useMemo, useState } from 'react';
import type { DealInputModel, ScenarioRecord } from '@/lib/models/deal';
import { createScenarioRecord, deleteScenario, encodeScenario, readScenarios, upsertScenario } from '@/lib/scenario-storage';

interface ScenarioToolbarProps {
  model: DealInputModel;
  onLoadScenario: (model: DealInputModel) => void;
}

export function ScenarioToolbar({ model, onLoadScenario }: ScenarioToolbarProps) {
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>(() => readScenarios());
  const [selectedId, setSelectedId] = useState<string>('');


  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.scenarioId === selectedId),
    [scenarios, selectedId]
  );

  const saveScenario = () => {
    const existing = scenarios.find((scenario) => scenario.dealName === model.purchase.dealName);
    const record = createScenarioRecord(model, existing ? { ...existing, payload: model, dealName: model.purchase.dealName } : undefined);
    const next = upsertScenario(record);
    setScenarios(next);
    setSelectedId(record.scenarioId);
  };

  const loadScenario = () => {
    if (!selectedScenario) return;
    onLoadScenario(selectedScenario.payload);
  };

  const removeScenario = () => {
    if (!selectedScenario) return;
    const next = deleteScenario(selectedScenario.scenarioId);
    setScenarios(next);
    setSelectedId('');
  };

  const exportScenario = () => {
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

  const importScenario = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const parsed = JSON.parse(text) as ScenarioRecord;
    const next = upsertScenario(parsed);
    setScenarios(next);
    setSelectedId(parsed.scenarioId);
    onLoadScenario(parsed.payload);
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-panel p-4 shadow-soft">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">Scenario Vault</p>
          <h2 className="text-lg font-semibold">Save, load, export (cloud-ready JSON)</h2>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <label className="sr-only" htmlFor="scenario-select">
          Scenario Select
        </label>
        <select
          id="scenario-select"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          <option value="">Select saved scenario</option>
          {scenarios.map((scenario) => (
            <option key={scenario.scenarioId} value={scenario.scenarioId}>
              {scenario.dealName}
            </option>
          ))}
        </select>

        <button className="rounded-lg bg-accent px-3 py-2 text-sm font-medium" onClick={saveScenario} type="button">
          Save
        </button>
        <button className="rounded-lg border border-white/10 px-3 py-2 text-sm" onClick={loadScenario} type="button">
          Load
        </button>
        <button className="rounded-lg border border-white/10 px-3 py-2 text-sm" onClick={exportScenario} type="button">
          Export
        </button>
        <button className="rounded-lg border border-rose-500/40 px-3 py-2 text-sm text-rose-200" onClick={removeScenario} type="button">
          Delete
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs text-muted">
        <span>Import JSON:</span>
        <input type="file" accept="application/json" onChange={importScenario} />
      </div>
    </section>
  );
}
