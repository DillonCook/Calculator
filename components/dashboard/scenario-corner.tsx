'use client';

import { useEffect, useMemo, useState } from 'react';
import { RecentScenariosCarousel } from '@/components/dashboard/recent-scenarios-carousel';
import { triggerHapticFeedback } from '@/lib/use-haptics';
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

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

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
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dialogMode, setDialogMode] = useState<'saveAs' | 'rename' | null>(null);
  const [dialogValue, setDialogValue] = useState('');

  const activeDeal = useMemo(() => deals.find((deal) => deal.scenarioId === activeDealId), [deals, activeDealId]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 120);
    return () => window.clearTimeout(timer);
  }, [search]);

  const normalizedSearch = debouncedSearch.trim().toLowerCase();
  const hasSearchQuery = normalizedSearch.length > 0;

  const filteredDeals = useMemo(() => {
    if (!normalizedSearch) return [];
    return deals.filter((deal) => deal.dealName.toLowerCase().includes(normalizedSearch));
  }, [deals, normalizedSearch]);


  const openDialog = (mode: 'saveAs' | 'rename') => {
    triggerHapticFeedback('light');
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
    triggerHapticFeedback('success');
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
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm transition-colors duration-150 focus-visible:border-accent/60 focus-visible:outline-none"
            placeholder="Search deal name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <RecentScenariosCarousel scenarios={deals} activeDealName={activeDealName} onOpen={onActiveDealChange} />

          {hasSearchQuery ? (
            <div className="rounded-xl border border-white/10 bg-black/10 p-2">
              {filteredDeals.length === 0 ? (
                <p className="px-1 py-1.5 text-xs text-muted">No deals match this search.</p>
              ) : (
                filteredDeals.map((deal) => (
                  <button
                    key={deal.scenarioId}
                    type="button"
                    onClick={() => {
                      triggerHapticFeedback('light');
                      onActiveDealChange(deal.scenarioId);
                    }}
                    className={`tap-feedback w-full rounded-lg border px-3 py-2 text-left text-sm transition-all duration-200 ease-out ${
                      deal.scenarioId === activeDealId
                        ? 'border-accent bg-accent/15 shadow-[0_12px_28px_-20px_rgba(45,212,191,0.8)]'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <p className="font-medium">{deal.dealName}</p>
                    <p className="text-xs text-muted">Updated {new Date(deal.updatedAt).toLocaleDateString()}</p>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          <button className="tap-feedback min-h-10 rounded-xl bg-accent px-3 text-sm font-medium text-black transition-all duration-200 hover:brightness-105" onClick={() => openDialog('saveAs')} type="button">
            Save As
          </button>
          <button
            className="tap-feedback min-h-10 rounded-xl border border-white/10 px-3 text-sm transition-colors duration-150 hover:bg-white/10"
            onClick={() => openDialog('rename')}
            type="button"
            disabled={!activeDeal}
          >
            Rename
          </button>
          <button
            className="tap-feedback min-h-10 rounded-xl border border-white/10 px-3 text-sm transition-colors duration-150 hover:bg-white/10"
            onClick={() => {
              triggerHapticFeedback('medium');
              onCreateNew();
            }}
            type="button"
          >
            New
          </button>
          <button
            className="tap-feedback min-h-10 rounded-xl border border-rose-500/40 px-3 text-sm text-rose-200 transition-colors duration-150 hover:bg-rose-500/10"
            onClick={() => {
              triggerHapticFeedback('medium');
              onDelete();
            }}
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
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm transition-colors duration-150 focus-visible:border-accent/60 focus-visible:outline-none"
              value={dialogValue}
              onChange={(event) => setDialogValue(event.target.value)}
              placeholder="Deal name"
            />
            <div className="flex gap-2">
              <button className="tap-feedback min-h-10 flex-1 rounded-lg bg-accent px-3 text-sm font-medium text-black transition-all duration-200 hover:brightness-105" type="button" onClick={submitDialog}>
                Confirm
              </button>
              <button className="tap-feedback min-h-10 flex-1 rounded-lg border border-white/10 px-3 text-sm transition-colors duration-150 hover:bg-white/10" type="button" onClick={() => { triggerHapticFeedback('light'); closeDialog(); }}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
