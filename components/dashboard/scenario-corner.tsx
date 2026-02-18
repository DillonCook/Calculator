'use client';

import type { ChangeEvent } from 'react';
import type { ScenarioRecord } from '@/lib/models/deal';

interface ScenarioCornerProps {
  scenarios: ScenarioRecord[];
  selectedId: string;
  onSelectedIdChange: (id: string) => void;
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onDelete: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function ScenarioCorner({
  scenarios,
  selectedId,
  onSelectedIdChange,
  onSave,
  onLoad,
  onExport,
  onDelete,
  onImport
}: ScenarioCornerProps) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted">Scenario Vault</p>
      <div className="mt-2 flex flex-col gap-2">
        <label className="sr-only" htmlFor="scenario-select">
          Scenario Select
        </label>
        <select
          id="scenario-select"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
          value={selectedId}
          onChange={(event) => onSelectedIdChange(event.target.value)}
        >
          <option value="">Select saved scenario</option>
          {scenarios.map((scenario) => (
            <option key={scenario.scenarioId} value={scenario.scenarioId}>
              {scenario.dealName}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-2">
          <button className="rounded-lg bg-accent px-3 py-2 text-sm font-medium" onClick={onSave} type="button">
            Save
          </button>
          <button className="rounded-lg border border-white/10 px-3 py-2 text-sm" onClick={onLoad} type="button">
            Load
          </button>
          <button className="rounded-lg border border-white/10 px-3 py-2 text-sm" onClick={onExport} type="button">
            Export
          </button>
          <button className="rounded-lg border border-rose-500/40 px-3 py-2 text-sm text-rose-200" onClick={onDelete} type="button">
            Delete
          </button>
        </div>

        <label className="text-xs text-muted">
          Import JSON
          <input className="mt-1 w-full text-xs" type="file" accept="application/json" onChange={onImport} />
        </label>
      </div>
    </section>
  );
}
