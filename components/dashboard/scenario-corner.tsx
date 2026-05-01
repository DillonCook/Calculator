'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { triggerHapticFeedback } from '@/lib/use-haptics';
import type { ScenarioRecord } from '@/lib/models/deal';

interface DealsVaultPanelProps {
  deals: ScenarioRecord[];
  activeDealId: string;
  activeDealName: string;
  onActiveDealChange: (id: string) => void;
  onSaveAs: (dealName: string, listingUrl: string) => void;
  onCreateNew: () => void;
  onLoadSampleDeal: () => void;
  onDeleteDeal: (scenarioId: string) => void;
  onRequestClose?: () => void;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

const formatListingSource = (url: string | null) => {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

function VaultActionButton({
  ariaLabel,
  title,
  onClick,
  disabled,
  tone = 'default',
  children
}: {
  ariaLabel: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'primary' | 'danger';
  children: ReactNode;
}) {
  const className =
    tone === 'primary'
      ? 'btn-primary btn-vault tap-feedback min-h-10 w-10 rounded-lg text-sm font-semibold'
      : tone === 'danger'
        ? 'tap-feedback min-h-10 w-10 rounded-lg border border-red-500/45 bg-red-500/12 text-sm font-semibold text-red-100 transition hover:bg-red-500/18 disabled:cursor-not-allowed disabled:opacity-50'
        : 'tap-feedback section-action section-action-utility min-h-10 w-10 rounded-lg text-sm font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <button type="button" aria-label={ariaLabel} title={title} onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  );
}

export function DealsVaultPanel({
  deals,
  activeDealId,
  activeDealName,
  onActiveDealChange,
  onSaveAs,
  onCreateNew,
  onLoadSampleDeal,
  onDeleteDeal,
  onRequestClose
}: DealsVaultPanelProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dialogMode, setDialogMode] = useState<'saveAs' | null>(null);
  const [dialogValue, setDialogValue] = useState('');
  const [dialogListingValue, setDialogListingValue] = useState('');

  const activeDeal = useMemo(() => deals.find((deal) => deal.scenarioId === activeDealId), [deals, activeDealId]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 120);
    return () => window.clearTimeout(timer);
  }, [search]);

  const sortedDeals = useMemo(
    () => [...deals].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [deals]
  );
  const normalizedSearch = debouncedSearch.trim().toLowerCase();
  const hasSearchQuery = normalizedSearch.length > 0;

  const filteredDeals = useMemo(() => {
    if (!normalizedSearch) return sortedDeals;
    return sortedDeals.filter((deal) => deal.dealName.toLowerCase().includes(normalizedSearch));
  }, [normalizedSearch, sortedDeals]);

  const visibleDeals = hasSearchQuery ? filteredDeals : filteredDeals.slice(0, 10);
  const hiddenRecentCount = hasSearchQuery ? 0 : Math.max(filteredDeals.length - visibleDeals.length, 0);

  const openDialog = (mode: 'saveAs') => {
    triggerHapticFeedback('light');
    setDialogMode(mode);

    const sourceDeal = activeDeal?.dealName ?? activeDealName;
    setDialogValue(sourceDeal ? `${sourceDeal} Copy` : 'New Deal Copy');
    setDialogListingValue(activeDeal?.payload.purchase.listingUrl ?? '');
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

    if (dialogMode === 'saveAs') onSaveAs(name, listingUrl);
    triggerHapticFeedback('success');
    closeDialog();
  };

  return (
    <section className="section-shell section-shell-utility rounded-3xl p-4 lg:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-100">Recent scenarios</h2>
          <p className="max-w-[68ch] text-sm text-muted">
            {hiddenRecentCount > 0
              ? 'Showing the 10 most recent deals for quick switching. Search to reach the rest of the vault.'
              : 'Switch into a saved scenario or create a fresh deal from here.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-slate-200">
            {deals.length} saved
          </span>
        </div>
      </div>

      <div className="section-inner mt-4 rounded-2xl p-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="block flex-1">
            <span className="sr-only">Search deals</span>
            <input
              className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none focus-visible:border-accent/75 focus-visible:shadow-[inset_0_0_0_1px_rgba(255,176,92,0.58)]"
              placeholder="Search deal name"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="flex items-center gap-2">
            <VaultActionButton ariaLabel="Create new deal" title="New deal" onClick={onCreateNew} tone="primary">
              +
            </VaultActionButton>
            <button
              type="button"
              aria-label="Load sample deal"
              title="Load sample deal"
              onClick={() => {
                triggerHapticFeedback('light');
                onLoadSampleDeal();
                onRequestClose?.();
              }}
              className="tap-feedback section-action section-action-utility min-h-10 rounded-lg px-3 text-xs font-semibold text-slate-200"
            >
              Sample
            </button>
            <VaultActionButton
              ariaLabel="Duplicate active deal"
              title="Duplicate active deal"
              onClick={() => openDialog('saveAs')}
              disabled={!activeDeal}
            >
              <svg viewBox="0 0 20 20" className="mx-auto h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <rect x="7" y="5" width="8" height="9" rx="1.5" />
                <path d="M5.5 11.5H5A1.5 1.5 0 0 1 3.5 10V5A1.5 1.5 0 0 1 5 3.5h5A1.5 1.5 0 0 1 11.5 5v.5" />
              </svg>
            </VaultActionButton>
          </div>
        </div>

        {dialogMode ? (
          <section className="section-inner mt-3 rounded-2xl p-3.5">
            <p className="section-eyebrow-utility text-xs uppercase tracking-[0.16em]">Duplicate active deal</p>
            <div className="mt-3 grid gap-2.5">
              <label className="space-y-1">
                <span className="text-[11px] text-muted">Deal name</span>
                <input
                  className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none focus-visible:border-accent/75 focus-visible:shadow-[inset_0_0_0_1px_rgba(255,176,92,0.58)]"
                  value={dialogValue}
                  onChange={(event) => setDialogValue(event.target.value)}
                  placeholder="Deal name"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-muted">Listing URL (optional)</span>
                <input
                  className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none focus-visible:border-accent/75 focus-visible:shadow-[inset_0_0_0_1px_rgba(255,176,92,0.58)]"
                  value={dialogListingValue}
                  onChange={(event) => setDialogListingValue(event.target.value)}
                  placeholder="Listing URL (optional)"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-primary btn-vault tap-feedback min-h-10 rounded-xl px-3 text-sm font-medium" type="button" onClick={submitDialog}>
                  Confirm
                </button>
                <button
                  className="tap-feedback section-action section-action-utility min-h-10 rounded-xl px-3 text-sm text-slate-200"
                  type="button"
                  onClick={() => {
                    triggerHapticFeedback('light');
                    closeDialog();
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {hiddenRecentCount > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-200">
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">Search all {deals.length} saved deals</span>
          </div>
        ) : null}

        <div className="scrollbar-premium mt-3 max-h-[28rem] overflow-y-auto pr-1">
          {visibleDeals.length === 0 ? (
            <div className="section-inner rounded-xl border-dashed px-4 py-6 text-center text-sm text-muted">
              {hasSearchQuery ? 'No deals match this search.' : 'No saved deals yet. Start with a blank or sample deal.'}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleDeals.map((deal) => {
                const isActive = deal.scenarioId === activeDealId;
                const listingSource = formatListingSource(deal.payload.purchase.listingUrl || null);

                return (
                  <div
                    key={deal.scenarioId}
                    className={`tap-feedback flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                      isActive ? 'accent-edge accent-edge-utility' : 'section-inner hover:bg-white/[0.08]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        triggerHapticFeedback('light');
                        onActiveDealChange(deal.scenarioId);
                        onRequestClose?.();
                      }}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                      aria-label={`Open ${deal.dealName}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                            isActive ? 'border-accent/35 bg-accent/12 text-accent' : 'border-white/10 bg-black/20 text-muted'
                          }`}>
                            {isActive ? 'Active' : 'Saved'}
                          </span>
                          <span className="text-[11px] text-muted">{dateFormatter.format(new Date(deal.updatedAt))}</span>
                        </div>
                        <p className="mt-1 truncate text-base font-semibold text-slate-100">{deal.dealName}</p>
                        <p className="mt-1 truncate text-xs text-muted">
                          {listingSource ? `Source: ${listingSource}` : 'No listing link attached'}
                        </p>
                      </div>
                      <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                        <path d="M7.5 4.5 12.5 10l-5 5.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <VaultActionButton
                      ariaLabel={`Delete ${deal.dealName}`}
                      title={`Delete ${deal.dealName}`}
                      onClick={() => {
                        triggerHapticFeedback('light');
                        onDeleteDeal(deal.scenarioId);
                      }}
                      tone="danger"
                    >
                      <svg viewBox="0 0 20 20" className="mx-auto h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                        <path d="M4.5 6h11" strokeLinecap="round" />
                        <path d="M7.5 6V4.75A.75.75 0 0 1 8.25 4h3.5a.75.75 0 0 1 .75.75V6" />
                        <path d="M6.5 6l.55 8.1A1 1 0 0 0 8.05 15h3.9a1 1 0 0 0 1-.9L13.5 6" strokeLinecap="round" />
                        <path d="M8.5 8.5v4M11.5 8.5v4" strokeLinecap="round" />
                      </svg>
                    </VaultActionButton>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
