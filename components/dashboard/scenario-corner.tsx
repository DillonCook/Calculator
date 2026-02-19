'use client';

import { useMemo, useState } from 'react';
import { RecentScenariosCarousel } from '@/components/dashboard/recent-scenarios-carousel';
import type { ScenarioRecord } from '@/lib/models/deal';

interface DealsVaultPanelProps {
  deals: ScenarioRecord[];
  activeDealId: string;
  activeDealName: string;
  saveStatus: 'idle' | 'saving' | 'saved';
  onActiveDealChange: (id: string) => void;
  onSaveAs: (dealName: string) => void;
  onRename: (dealName: string) => void;
  onCreateNew: () => void;
  onDelete: () => void;
}

export function DealsVaultPanel({
  deals,
  activeDealId,
  activeDealName,
  saveStatus,
  onActiveDealChange,
  onSaveAs,
  onRename,
  onCreateNew,
  onDelete
}: DealsVaultPanelProps) {
  const [search, setSearch] = useState('');
  const [dialogMode, setDialogMode] = useState<'saveAs' | 'rename' | null>(null);
  const [dialogValue, setDialogValue] = useState('');

  const activeDeal = useMemo(() => deals.find((deal) => deal.scenarioId === activeDealId), [deals, activeDealId]);

  const filteredDeals = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return deals.filter((deal) => !normalizedSearch || deal.dealName.toLowerCase().includes(normalizedSearch));
  }, [deals, search]);

  const openDialog = (mode: 'saveAs' | 'rename') => {
    setDialogMode(mode);
    setDialogValue(activeDeal?.dealName ?? '');
  };

  const closeDialog = () => {
    setDialogMode(null);
    setDialogValue('');
  };

  const submitDialog = () => {
    const name = dialogValue.trim();
    if (!name) return;
    if (dialogMode === 'rename') onRename(name);
    if (dialogMode === 'saveAs') onSaveAs(name);
    closeDialog();
  };

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-2.5 sm:p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wider text-muted">Deals Vault</p>
        <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-muted">
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Ready'}
        </span>
      </div>

      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_208px] lg:items-start">
        <div className="space-y-2">
          <label className="sr-only" htmlFor="deal-search">
            Search deals
          </label>
          <input
            id="deal-search"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
            placeholder="Search deal name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <RecentScenariosCarousel scenarios={deals} activeDealName={activeDealName} onOpen={onActiveDealChange} />

          <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-xl border border-white/10 bg-black/10 p-1.5 sm:max-h-48 sm:p-2">
            {filteredDeals.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted">No deals match this search.</p>
            ) : (
              filteredDeals.map((deal) => (
                <button
                  key={deal.scenarioId}
                  type="button"
                  onClick={() => onActiveDealChange(deal.scenarioId)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    deal.scenarioId === activeDealId ? 'border-accent bg-accent/15' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <p className="font-medium">{deal.dealName}</p>
                  <p className="text-xs text-muted">Updated {new Date(deal.updatedAt).toLocaleDateString()}</p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          <button className="min-h-10 rounded-xl bg-accent px-3 text-sm font-medium text-black" onClick={() => openDialog('saveAs')} type="button">
            Save As
          </button>
          <button
            className="min-h-10 rounded-xl border border-white/10 px-3 text-sm"
            onClick={() => openDialog('rename')}
            type="button"
            disabled={!activeDeal}
          >
            Rename
          </button>
          <button
            className="min-h-10 rounded-xl border border-white/10 px-3 text-sm"
            onClick={onCreateNew}
            type="button"
          >
            New
          </button>
          <button
            className="min-h-10 rounded-xl border border-rose-500/40 px-3 text-sm text-rose-200"
            onClick={onDelete}
            type="button"
            disabled={!activeDeal}
          >
            Delete
          </button>
        </div>

        {dialogMode ? (
          <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-2.5 lg:col-span-2">
            <p className="text-xs uppercase tracking-wider text-muted">{dialogMode === 'saveAs' ? 'Save as new deal' : 'Rename deal'}</p>
            <input
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
              value={dialogValue}
              onChange={(event) => setDialogValue(event.target.value)}
              placeholder="Deal name"
            />
            <div className="flex gap-2">
              <button className="min-h-10 flex-1 rounded-lg bg-accent px-3 text-sm font-medium text-black" type="button" onClick={submitDialog}>
                Confirm
              </button>
              <button className="min-h-10 flex-1 rounded-lg border border-white/10 px-3 text-sm" type="button" onClick={closeDialog}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
