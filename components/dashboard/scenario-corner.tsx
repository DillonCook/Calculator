'use client';

import { useEffect, useMemo, useState } from 'react';
import { RecentScenariosCarousel } from '@/components/dashboard/recent-scenarios-carousel';
import { triggerHapticFeedback } from '@/lib/use-haptics';
import type { ScenarioRecord } from '@/lib/models/deal';

interface DealsVaultPanelProps {
  deals: ScenarioRecord[];
  activeDealId: string;
  activeDealName: string;
  activeDealListingValue: string;
  activeDealListingUrl: string | null;
  printToPdfUrl: string;
  saveStatus: 'idle' | 'saving' | 'saved';
  onActiveDealChange: (id: string) => void;
  onShareLink: () => void;
  onSaveAs: (dealName: string, listingUrl: string) => void;
  onRename: (dealName: string) => void;
  onCreateNew: (dealName: string, listingUrl: string) => void;
  onDealNameChange: (dealName: string) => void;
  onListingUrlChange: (listingUrl: string) => void;
  onDelete: () => void;
  compactLayout?: boolean;
  defaultExpanded?: boolean;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const DEALS_VAULT_COLLAPSED_KEY = 'deals-vault-collapsed';

export function DealsVaultPanel({
  deals,
  activeDealId,
  activeDealName,
  activeDealListingValue,
  activeDealListingUrl,
  printToPdfUrl,
  saveStatus,
  onActiveDealChange,
  onShareLink,
  onSaveAs,
  onRename,
  onCreateNew,
  onDealNameChange,
  onListingUrlChange,
  onDelete,
  compactLayout = false,
  defaultExpanded = false
}: DealsVaultPanelProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dialogMode, setDialogMode] = useState<'saveAs' | 'rename' | 'create' | null>(null);
  const [dialogValue, setDialogValue] = useState('');
  const [dialogListingValue, setDialogListingValue] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (defaultExpanded) return false;
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(DEALS_VAULT_COLLAPSED_KEY) === '1';
  });

  const activeDeal = useMemo(() => deals.find((deal) => deal.scenarioId === activeDealId), [deals, activeDealId]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 120);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (defaultExpanded) setIsCollapsed(false);
  }, [defaultExpanded]);


  useEffect(() => {
    window.localStorage.setItem(DEALS_VAULT_COLLAPSED_KEY, isCollapsed ? '1' : '0');
  }, [isCollapsed]);

  const normalizedSearch = debouncedSearch.trim().toLowerCase();
  const hasSearchQuery = normalizedSearch.length > 0;

  const filteredDeals = useMemo(() => {
    if (!normalizedSearch) return [];
    return deals.filter((deal) => deal.dealName.toLowerCase().includes(normalizedSearch));
  }, [deals, normalizedSearch]);

  const openDialog = (mode: 'saveAs' | 'rename' | 'create') => {
    triggerHapticFeedback('light');
    setDialogMode(mode);
    if (mode === 'create') {
      setDialogValue('New Deal');
      setDialogListingValue('');
      return;
    }
    setDialogValue(activeDeal?.dealName ?? activeDealName);
    setDialogListingValue(activeDeal?.payload.purchase.listingUrl ?? activeDealListingValue);
  };

  const closeDialog = () => {
    setDialogMode(null);
    setDialogValue('');
    setDialogListingValue('');
  };

  const submitDialog = () => {
    const name = dialogValue.trim();
    const listingUrl = dialogListingValue.trim();
    if (!name) return;
    if (dialogMode === 'rename') onRename(name);
    if (dialogMode === 'saveAs') onSaveAs(name, listingUrl);
    if (dialogMode === 'create') onCreateNew(name, listingUrl);
    triggerHapticFeedback('success');
    closeDialog();
  };

  const stopSummaryToggle = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <details
      className="rounded-xl border border-white/10 bg-white/5 p-2.5 sm:p-3"
      open={!isCollapsed}
      onToggle={(event) => {
        const nextCollapsed = !(event.currentTarget as HTMLDetailsElement).open;
        setIsCollapsed(nextCollapsed);
        if (nextCollapsed) closeDialog();
      }}
    >
      <summary className={`tap-feedback flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 ${isCollapsed ? 'mb-0' : 'mb-2'}`}>
        <div className="min-w-0 flex items-center gap-2">
          <p className="text-[11px] uppercase tracking-wider text-muted">Deals Vault</p>
          <div className={`${compactLayout ? 'hidden' : 'hidden md:flex md:items-center md:gap-1.5'}`}>
            <span className="max-w-[220px] truncate rounded-md border border-white/15 bg-black/20 px-2 py-0.5 text-[11px] text-slate-200">
              Active: {activeDealName}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-muted">
            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Idle'}
          </span>
          <div className={`${compactLayout ? 'hidden' : 'hidden md:flex md:items-center md:gap-1.5'}`}>
            {activeDealListingUrl ? (
              <button
                type="button"
                onClick={(event) => {
                  stopSummaryToggle(event);
                  window.open(activeDealListingUrl, '_blank', 'noopener,noreferrer');
                }}
                className="tap-feedback inline-flex min-h-7 items-center rounded-md border border-accent/40 bg-accent/12 px-2 text-[11px] font-medium text-accent hover:border-accent/65 hover:bg-accent/20"
              >
                Listing Link
              </button>
            ) : null}
            <button
              type="button"
              onClick={(event) => {
                stopSummaryToggle(event);
                window.open(printToPdfUrl, '_blank', 'noopener,noreferrer');
              }}
              className="btn-primary btn-pdf tap-feedback inline-flex min-h-7 items-center rounded-md px-2 text-[11px] font-medium"
            >
              Print to PDF
            </button>
            <button
              type="button"
              onClick={(event) => {
                stopSummaryToggle(event);
                onShareLink();
              }}
              className="btn-primary btn-link tap-feedback inline-flex min-h-7 items-center rounded-md px-2 text-[11px] font-medium"
            >
              Send link
            </button>
          </div>
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-white/15 bg-black/20 px-2 text-sm font-semibold text-slate-200 transition-transform duration-200">
            {isCollapsed ? '+' : '-'}
          </span>
        </div>
      </summary>

      {isCollapsed ? (
        <div className="mt-2 rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-xs text-muted">
          <p className="line-clamp-1">Active: <span className="text-slate-100">{activeDealName}</span></p>
          <p className="mt-0.5">{deals.length} saved {deals.length === 1 ? 'scenario' : 'scenarios'}</p>
        </div>
      ) : (
        <div className="mt-2.5 grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_160px] lg:items-start">
          <div className="space-y-2">
            <div className="rounded-xl border border-white/10 bg-black/15 p-2.5">
              <p className="text-[11px] uppercase tracking-wider text-muted">Deal identity</p>
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-[11px] text-muted">Deal name</span>
                  <input
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 text-sm outline-none focus-visible:border-accent/75 focus-visible:shadow-[inset_0_0_0_1px_rgba(255,176,92,0.58)]"
                    value={activeDealName}
                    onChange={(event) => onDealNameChange(event.target.value)}
                    placeholder="Deal title"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-muted">Listing URL (Zillow, Redfin, etc.)</span>
                  <input
                    aria-label="Listing URL (Zillow, Redfin, etc.)"
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 text-sm outline-none focus-visible:border-accent/75 focus-visible:shadow-[inset_0_0_0_1px_rgba(255,176,92,0.58)]"
                    value={activeDealListingValue}
                    onChange={(event) => onListingUrlChange(event.target.value)}
                    placeholder="Listing URL (optional)"
                  />
                </label>
              </div>
            </div>

            <label className="sr-only" htmlFor="deal-search">
              Search deals
            </label>
            <input
              id="deal-search"
              className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none focus-visible:border-accent/75 focus-visible:shadow-[inset_0_0_0_1px_rgba(255,176,92,0.58)]"
              placeholder="Search deal name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            {hasSearchQuery ? (
              <div className="rounded-xl border border-white/10 bg-black/10 p-2">
                {filteredDeals.length === 0 ? (
                  <p className="px-1 py-1.5 text-xs text-muted">No deals match this search.</p>
                ) : (
                  <div className={compactLayout ? 'grid gap-2' : '-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1'}>
                    {filteredDeals.map((deal) => (
                      <button
                        key={deal.scenarioId}
                        type="button"
                        onClick={() => onActiveDealChange(deal.scenarioId)}
                        className={`tap-feedback rounded-lg border px-3 py-2 text-left text-sm transition ${
                          deal.scenarioId === activeDealId
                            ? 'accent-edge'
                            : 'border-white/10 bg-white/5 hover:bg-white/10'
                        } ${compactLayout ? 'w-full min-w-0' : 'min-w-[190px] snap-start sm:min-w-[220px]'}`}
                      >
                        <p className="line-clamp-1 font-medium">{deal.dealName}</p>
                        <p className="text-xs text-muted">Updated {dateFormatter.format(new Date(deal.updatedAt))}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <RecentScenariosCarousel scenarios={deals} activeDealName={activeDealName} onOpen={onActiveDealChange} />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              className="tap-feedback h-10 rounded-md border border-white/10 bg-white/[0.03] px-2 text-sm font-medium text-slate-200 transition-colors duration-150 hover:bg-white/10 hover:text-white"
              onClick={() => openDialog('saveAs')}
              type="button"
              aria-label="Duplicate"
              title="Duplicate"
            >
              ⧉
            </button>
            <button
              className="tap-feedback h-10 rounded-md border border-white/10 px-2 text-sm font-medium"
              onClick={() => openDialog('rename')}
              type="button"
              disabled={!activeDeal}
              aria-label="Rename"
              title="Rename"
            >
              ✎
            </button>
            <button
              className="btn-primary btn-vault tap-feedback h-10 rounded-md px-2 text-sm font-semibold"
              onClick={() => openDialog('create')}
              type="button"
              aria-label="Create"
              title="Create"
            >
              +
            </button>
            <button
              className="tap-feedback h-10 rounded-md border border-red-500/50 px-2 text-sm font-medium text-red-200"
              onClick={onDelete}
              type="button"
              disabled={!activeDeal}
              aria-label="Delete"
              title="Delete"
            >
              ×
            </button>
          </div>

          {dialogMode ? (
            <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-2.5 lg:col-span-2">
              <p className="text-xs uppercase tracking-wider text-muted">
                {dialogMode === 'saveAs' ? 'Save as new deal' : dialogMode === 'create' ? 'Create new deal' : 'Rename deal'}
              </p>
              <input
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus-visible:border-accent/75 focus-visible:shadow-[inset_0_0_0_1px_rgba(255,176,92,0.58)]"
                value={dialogValue}
                onChange={(event) => setDialogValue(event.target.value)}
                placeholder="Deal name"
              />
              {dialogMode !== 'rename' ? (
                <input
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus-visible:border-accent/75 focus-visible:shadow-[inset_0_0_0_1px_rgba(255,176,92,0.58)]"
                  value={dialogListingValue}
                  onChange={(event) => setDialogListingValue(event.target.value)}
                  placeholder="Listing URL (optional)"
                />
              ) : null}
              <div className="flex gap-2">
                <button className="btn-primary btn-vault tap-feedback min-h-10 flex-1 rounded-lg px-3 text-sm font-medium" type="button" onClick={submitDialog}>
                  Confirm
                </button>
                <button className="tap-feedback min-h-10 flex-1 rounded-lg border border-white/10 px-3 text-sm transition-colors duration-150 hover:bg-white/10" type="button" onClick={() => { triggerHapticFeedback('light'); closeDialog(); }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </details>
  );
}
