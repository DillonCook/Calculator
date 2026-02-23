'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { DealInputPanel } from '@/components/dashboard/deal-input-panel';
import { DealWorkoutCard } from '@/components/dashboard/deal-workout-card';
import { DealsVaultPanel } from '@/components/dashboard/scenario-corner';
import { StrategyComparison } from '@/components/dashboard/strategy-comparison';
import { StrategyModuleInputs } from '@/components/dashboard/strategy-module-inputs';
import { StrategyTabs } from '@/components/dashboard/strategy-tabs';
import { StrategyWorkLightbox } from '@/components/dashboard/strategy-work-lightbox';
import { TimelineCard } from '@/components/dashboard/timeline-card';
import { KpiCard } from '@/components/ui/kpi-card';
import { createDealInVault, readDealsFromVault, removeDealFromVault, saveDealToVault } from '@/lib/deals-vault-service';
import { calculateDeal } from '@/lib/engine/deal-engine';
import { calculateCashToClose } from '@/lib/engine/finance';
import { type DealWorkoutScenario } from '@/lib/engine/deal-workout';
import { defaultDealInput, type DealInputModel, type ScenarioRecord, type StrategyKey } from '@/lib/models/deal';
import { createScenarioRecord, encodeScenario } from '@/lib/scenario-storage';
import { decodeDealFromShareParam, encodeDealToShareParam } from '@/lib/share-link';

import { currencyFormatter, percentFormatter } from '@/lib/formatters';
import { triggerHapticFeedback } from '@/lib/use-haptics';
import { normalizeListingUrl } from '@/lib/listing-link';


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



const initialDeals = readDealsFromVault();
const initialActiveDeal = initialDeals[0];

export default function HomePage() {
  const [model, setModel] = useState(initialActiveDeal?.payload ?? defaultDealInput);
  const [activeStrategy, setActiveStrategy] = useState<StrategyKey>('longTerm');
  const [deals, setDeals] = useState<ScenarioRecord[]>(initialDeals);
  const [activeDealId, setActiveDealId] = useState(initialActiveDeal?.scenarioId ?? '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isStrategyWorkOpen, setIsStrategyWorkOpen] = useState(false);
  const [includeReservesByStrategy, setIncludeReservesByStrategy] = useState<Record<StrategyKey, boolean>>({
    purchase: true,
    longTerm: true,
    airbnb: true,
    padSplit: true,
    brrrr: true,
    flip: true
  });
  const [shareFeedback, setShareFeedback] = useState<{ tone: 'success' | 'error'; message: string; fallbackUrl?: string } | null>(null);
  const [mobileInputSheet, setMobileInputSheet] = useState<'core' | 'strategy' | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const result = useMemo(() => calculateDeal(model), [model]);
  const exportPayload = useMemo(() => encodeScenario(createScenarioRecord(model)), [model]);

  const activeOutput = result[activeStrategy];
  const activeStrategyLabel = activeStrategyLabels[activeStrategy];
  const quickScanPoints = quickScanDetails[activeStrategy];
  const isFlipStrategy = activeStrategy === 'flip';
  const supportsReserveToggle = activeStrategy === 'longTerm' || activeStrategy === 'airbnb' || activeStrategy === 'padSplit' || activeStrategy === 'brrrr';
  const includeReserves = includeReservesByStrategy[activeStrategy];
  const priorityMetricValue = isFlipStrategy
    ? activeOutput.saleProceeds ?? 0
    : supportsReserveToggle && !includeReserves
      ? activeOutput.monthlyCashFlowExcludingReserves ?? activeOutput.monthlyCashFlow
      : activeOutput.monthlyCashFlow;

  const cashToCloseValue = useMemo(() => {
    const { purchase } = model;

    if (purchase.ownershipMode === 'owned') {
      return Math.max(purchase.helocClosingCosts, 0);
    }

    return calculateCashToClose(
      purchase.purchasePrice,
      0,
      purchase.downPaymentPercent,
      purchase.closingCostPercent,
      purchase.pointsPercent,
      purchase.financingType,
      purchase.helocAmount,
      purchase.helocClosingCosts
    );
  }, [model]);


  const monthlyCashFlowChartSeries = useMemo(() => {
    if (isFlipStrategy) return [];

    const timelineWithoutAcquisitionYear = activeOutput.cashFlowTimeline.slice(1);
    const terminalSaleProceeds = activeOutput.saleProceeds ?? 0;
    const cashFlowOnlyTimeline = timelineWithoutAcquisitionYear.map((value, index, array) =>
      index === array.length - 1 ? value - terminalSaleProceeds : value
    );
    const rawTimeline = cashFlowOnlyTimeline;

    if (rawTimeline.length > 0) {
      return rawTimeline.map((value) => {
        if (supportsReserveToggle && !includeReserves) {
          const reserveDelta = (activeOutput.monthlyCashFlowExcludingReserves ?? activeOutput.monthlyCashFlow) - activeOutput.monthlyCashFlow;
          return value + reserveDelta * 12;
        }
        return value;
      });
    }

    return Array.from({ length: 12 }, (_, index) => activeOutput.monthlyCashFlow * (0.82 + index * 0.03));
  }, [activeOutput, includeReserves, isFlipStrategy, supportsReserveToggle]);

  const monthlyCashFlowBarData = useMemo(() => {
    if (!monthlyCashFlowChartSeries.length) return [];

    const chartTop = 6;
    const chartBottom = 34;
    const chartHeight = chartBottom - chartTop;
    const barCount = monthlyCashFlowChartSeries.length;

    const maxPositive = Math.max(...monthlyCashFlowChartSeries.filter((value) => value > 0), 0);
    const maxNegativeAbs = Math.max(...monthlyCashFlowChartSeries.filter((value) => value < 0).map((value) => Math.abs(value)), 0);

    const targetBaseWidth = barCount >= 28 ? 1.4 : barCount > 18 ? 1.85 : barCount > 12 ? 2.35 : 2.8;
    const naturalGap = Math.max((100 - barCount * targetBaseWidth) / (barCount + 1), 0.12);
    const gap = Math.max(naturalGap * 0.42, 0.1);
    const barWidth = Math.max((100 - gap * (barCount + 1)) / barCount, 0.95);

    return monthlyCashFlowChartSeries.map((value, index) => {
      const x = gap + index * (barWidth + gap);
      const denominator = value < 0 ? Math.max(maxNegativeAbs, 1) : Math.max(maxPositive, 1);
      const normalized = Math.min(Math.abs(value) / denominator, 1);
      const emphasized = Math.pow(normalized, 0.72);
      const height = Math.max(emphasized * chartHeight, 0.7);

      return {
        key: `bar-${index}`,
        x,
        y: chartBottom - height,
        width: barWidth,
        height,
        isNegative: value < 0
      };
    });
  }, [monthlyCashFlowChartSeries]);

  const cashFlowBarsAnimationKey = useMemo(
    () => `${activeStrategy}:${monthlyCashFlowChartSeries.map((value) => value.toFixed(2)).join('|')}`,
    [activeStrategy, monthlyCashFlowChartSeries]
  );

  const activeDeal = useMemo(
    () => deals.find((deal) => deal.scenarioId === activeDealId),
    [deals, activeDealId]
  );

  const loadScenario = (payload: DealInputModel, dealId?: string) => {
    setModel(payload);
    if (dealId) setActiveDealId(dealId);
  };

  const updateModel: Dispatch<SetStateAction<DealInputModel>> = (nextModel) => {
    if (activeDealId) setSaveStatus('saving');
    setModel(nextModel);
  };

  useEffect(() => {
    if (!activeDealId || saveStatus !== 'saving') return;

    const timer = window.setTimeout(() => {
      const existing = readDealsFromVault().find((deal) => deal.scenarioId === activeDealId);
      if (!existing) {
        setSaveStatus('idle');
        return;
      }

      const updatedDeal: ScenarioRecord = {
        ...existing,
        payload: model,
        dealName: model.purchase.dealName
      };

      const nextDeals = saveDealToVault(updatedDeal);
      setDeals(nextDeals);
      setSaveStatus('saved');
    }, 650);

    return () => window.clearTimeout(timer);
  }, [model, activeDealId, saveStatus]);

  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const timer = window.setTimeout(() => setSaveStatus('idle'), 1500);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  useEffect(() => {
    if (!shareFeedback) return;
    const timer = window.setTimeout(() => setShareFeedback(null), 3200);
    return () => window.clearTimeout(timer);
  }, [shareFeedback]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updateMotionPreference();
    mediaQuery.addEventListener('change', updateMotionPreference);

    return () => mediaQuery.removeEventListener('change', updateMotionPreference);
  }, []);

  const saveDealAs = (dealName: string) => {
    const record = createDealInVault(model, dealName);
    const next = saveDealToVault(record);
    setModel(record.payload);
    setDeals(next);
    setActiveDealId(record.scenarioId);
    setSaveStatus('saved');
  };

  const renameDeal = (dealName: string) => {
    if (!activeDeal) return;
    const payload = {
      ...model,
      purchase: {
        ...model.purchase,
        dealName
      }
    };

    setModel(payload);
    const next = saveDealToVault({ ...activeDeal, dealName, payload });
    setDeals(next);
    setSaveStatus('saved');
  };

  const createNewDeal = () => {
    const normalizedNames = new Set(deals.map((deal) => deal.dealName.toLowerCase()));
    let index = 1;
    let candidateName = 'New Deal';

    while (normalizedNames.has(candidateName.toLowerCase())) {
      index += 1;
      candidateName = `New Deal ${index}`;
    }

    const payload: DealInputModel = {
      ...defaultDealInput,
      purchase: {
        ...defaultDealInput.purchase,
        dealName: candidateName
      },
      longTerm: { ...defaultDealInput.longTerm },
      airbnb: { ...defaultDealInput.airbnb },
      padSplit: { ...defaultDealInput.padSplit },
      brrrr: { ...defaultDealInput.brrrr },
      flip: { ...defaultDealInput.flip },
      variableExpenses: defaultDealInput.variableExpenses.map((expense) => ({
        ...expense,
        appliesTo: { ...expense.appliesTo }
      })),
      assumptions: { ...defaultDealInput.assumptions }
    };

    const nextDeal = createDealInVault(payload, candidateName);
    const next = saveDealToVault(nextDeal);
    setDeals(next);
    setActiveDealId(nextDeal.scenarioId);
    setModel(nextDeal.payload);
    setSaveStatus('saved');
  };

  const openRecentScenario = (scenarioId: string) => {
    const scenario = deals.find((entry) => entry.scenarioId === scenarioId);
    if (!scenario) return;
    loadScenario(scenario.payload, scenario.scenarioId);
  };

  const removeScenario = () => {
    if (!activeDeal) return;
    const next = removeDealFromVault(activeDeal.scenarioId);
    setDeals(next);
    setActiveDealId('');
    setSaveStatus('idle');
  };



  const resolveListingDealName = useCallback(async () => null, []);

  const shareCurrentDeal = async () => {
    const encoded = encodeDealToShareParam(model);
    if (!encoded) {
      setShareFeedback({ tone: 'error', message: 'Unable to generate a share link for this deal.' });
      return;
    }

    const url = `${window.location.origin}${window.location.pathname}?s=${encoded}`;

    try {
      await navigator.clipboard.writeText(url);
      triggerHapticFeedback('success');
      setShareFeedback({ tone: 'success', message: 'Share link copied to clipboard.' });
    } catch {
      triggerHapticFeedback('medium');
      setShareFeedback({ tone: 'error', message: 'Copy failed. Use this link manually.', fallbackUrl: url });
    }
  };

  const applyDealWorkoutScenario = (scenario: DealWorkoutScenario) => {
    triggerHapticFeedback('success');
    updateModel((current) => ({
      ...current,
      purchase: {
        ...current.purchase,
        purchasePrice: scenario.adjustments.purchasePrice ?? current.purchase.purchasePrice,
        downPaymentPercent: scenario.adjustments.downPaymentPercent ?? current.purchase.downPaymentPercent
      }
    }));
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedToken = params.get('s');
    if (!sharedToken) return;

    const parsed = decodeDealFromShareParam(sharedToken);
    const syncImportTimer = window.setTimeout(() => {
      if (!parsed) return;
      const imported = createDealInVault(parsed, parsed.purchase.dealName);
      const nextDeals = saveDealToVault(imported);
      setDeals(nextDeals);
      setModel(imported.payload);
      setActiveDealId(imported.scenarioId);
    }, 0);

    params.delete('s');
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);

    return () => window.clearTimeout(syncImportTimer);
  }, []);

  return (
    <main className="app-shell-fade relative min-h-screen overflow-x-hidden px-4 py-6 md:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[340px] bg-[radial-gradient(circle_at_top,rgba(49,121,185,0.25)_0%,rgba(49,121,185,0.1)_35%,transparent_70%)]" />
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="panel-surface rounded-2xl p-5 shadow-soft backdrop-blur">
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
              <div className="min-w-0 max-w-3xl">
                <h1 className="text-2xl font-semibold md:text-3xl bg-[linear-gradient(120deg,#0b1b3a_0%,#2563eb_38%,#06b6d4_62%,#0b1b3a_100%)] bg-[length:200%_200%] bg-clip-text text-transparent animate-[gradientShift_12s_ease-in-out_infinite]">DealCooker</h1>
                <p className="text-sm text-muted">Create addictive, pro-grade real estate strategy snapshots in seconds with instant cash flow, DSCR, ROI, and IRR intelligence.</p>
              </div>
              <div className="w-full md:w-auto md:min-w-[420px] lg:min-w-[560px]">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <div className="col-span-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 sm:col-span-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-muted">Active Deal</p>
                        <p className="truncate text-sm font-medium">{model.purchase.dealName}</p>
                      </div>
                      {model.purchase.listingUrl ? (
                        <a
                          className="inline-flex shrink-0 items-center self-center text-xs text-accent underline decoration-accent/70 underline-offset-2"
                          href={normalizeListingUrl(model.purchase.listingUrl)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View listing link
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <Link
                    href={`/print?scenario=${exportPayload}&strategy=${activeStrategy}`}
                    className="btn-primary inline-flex min-h-10 items-center justify-center rounded-xl px-3 py-1.5 text-xs font-medium sm:min-h-11 sm:px-4 sm:py-2 sm:text-sm"
                    target="_blank"
                  >
                    Print View
                  </Link>
                  <button
                    type="button"
                    onClick={shareCurrentDeal}
                    className="btn-primary min-h-10 rounded-xl px-3 py-1.5 text-xs font-medium sm:min-h-11 sm:px-4 sm:py-2 sm:text-sm"
                  >
                    Share Link
                  </button>
                </div>
              </div>
            </div>

            {shareFeedback ? (
              <div
                role="status"
                className={`rounded-xl border px-3 py-2 text-xs sm:text-sm ${
                  shareFeedback.tone === 'success' ? 'border-accent/45 bg-accent/10 text-slate-100' : 'border-red-500/45 bg-red-500/15 text-red-100'
                }`}
              >
                <p>{shareFeedback.message}</p>
                {shareFeedback.fallbackUrl ? (
                  <p className="mt-1 break-all text-[11px] text-red-100/90 sm:text-xs">{shareFeedback.fallbackUrl}</p>
                ) : null}
              </div>
            ) : null}

            <DealsVaultPanel
              deals={deals}
              activeDealId={activeDealId}
              activeDealName={model.purchase.dealName}
              saveStatus={saveStatus}
              onActiveDealChange={openRecentScenario}
              onSaveAs={saveDealAs}
              onRename={renameDeal}
              onCreateNew={createNewDeal}
              onDelete={removeScenario}
            />

          </div>
        </header>

        <section className="grid gap-2 md:hidden">
          <StrategyTabs
            active={activeStrategy}
            onChange={setActiveStrategy}
            quickScan={{ title: activeStrategyLabel, notes: activeOutput.notes, points: quickScanPoints }}
          />
          <p className="text-xs text-muted">Tap to select the strategy for your inputs.</p>
          <div className="sticky top-2 z-30 -mx-1 rounded-xl border border-white/10 bg-surface/90 px-1 py-1 backdrop-blur">
            <div className="grid grid-cols-2 gap-2 max-[359px]:grid-cols-1">
              <button
                type="button"
                onClick={() => setMobileInputSheet('core')}
                className="btn-primary min-h-11 rounded-xl px-3 py-2 text-sm font-medium leading-tight"
              >
                Core Deal Inputs
              </button>
              <button
                type="button"
                onClick={() => setMobileInputSheet('strategy')}
                className="btn-primary min-h-11 rounded-xl px-3 py-2 text-sm font-medium leading-tight"
              >
                Strategy Inputs
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              triggerHapticFeedback('light');
              setIsStrategyWorkOpen(true);
            }}
            className="btn-primary tap-feedback min-h-11 rounded-xl px-3 py-2 text-sm font-medium leading-tight"
          >
            Show work
          </button>
        </section>

        <section className="accent-edge rounded-2xl p-4 shadow-soft">
          <div className="grid gap-3 lg:grid-cols-2 lg:items-stretch">
            <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:p-4">
              {!isFlipStrategy ? (
                <div className="pointer-events-none absolute inset-0 z-0 select-none" aria-hidden="true">
                  <div
                    className="absolute inset-0 opacity-25"
                    style={{
                      backgroundImage:
                        'radial-gradient(circle at 22% 24%, rgba(148, 186, 255, 0.2) 0.7px, transparent 1.3px), radial-gradient(circle at 72% 30%, rgba(164, 198, 255, 0.16) 0.5px, transparent 1.1px), radial-gradient(circle at 56% 76%, rgba(129, 170, 241, 0.12) 0.8px, transparent 1.5px)',
                      backgroundSize: '92px 92px, 128px 128px, 146px 146px'
                    }}
                  />
                  <svg
                    key={`cashflow-ribbon-${activeStrategy}-${cashFlowBarsAnimationKey}`}
                    viewBox="0 0 100 40"
                    className="absolute inset-x-0 bottom-0 h-[42%] w-full"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="cashflowBarPosGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#5CCBFF" stopOpacity="0.56" />
                        <stop offset="100%" stopColor="#1E4778" stopOpacity="0.08" />
                      </linearGradient>
                      <linearGradient id="cashflowBarNegGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FF9A55" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#5B2B16" stopOpacity="0.09" />
                      </linearGradient>
                    </defs>
                    {monthlyCashFlowBarData.map((bar, index) => (
                      <rect
                        key={`${bar.key}-${cashFlowBarsAnimationKey}`}
                        x={bar.x}
                        y={bar.y}
                        width={bar.width}
                        height={bar.height}
                        rx={bar.width / 2}
                        fill={bar.isNegative ? 'url(#cashflowBarNegGrad)' : 'url(#cashflowBarPosGrad)'}
                        opacity={0.52}
                      >
                        {!prefersReducedMotion ? (
                          <animate
                            attributeName="height"
                            from="0"
                            to={String(bar.height)}
                            dur="0.75s"
                            begin={`${Math.min(index * 0.02, 0.32)}s`}
                            fill="freeze"
                          />
                        ) : null}
                        {!prefersReducedMotion ? (
                          <animate
                            attributeName="y"
                            from="34"
                            to={String(bar.y)}
                            dur="0.75s"
                            begin={`${Math.min(index * 0.02, 0.32)}s`}
                            fill="freeze"
                          />
                        ) : null}
                      </rect>
                    ))}
                  </svg>
                </div>
              ) : null}
              <div className="relative z-10 pr-20">
                <p className="text-xs uppercase tracking-[0.16em] text-accent">Monthly Cash Flow</p>
                <p className="mt-1 text-sm text-muted">Includes maintenance and CapEx reserves for a conservative monthly cash flow view</p>
                <p className="absolute right-0 top-0 text-xs italic tracking-wide text-accent/90">{activeStrategyLabel}</p>
              </div>

              <div className="relative z-10 mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <p
                  className={`text-4xl font-semibold tracking-tight sm:text-6xl ${priorityMetricValue >= 0 ? 'text-emerald-300' : 'text-white'}`}
                  data-testid="kpi-priority-metric"
                >
                  {currencyFormatter.format(priorityMetricValue)}
                </p>

                {supportsReserveToggle ? (
                  <div className="flex shrink-0 items-center sm:pb-1">
                    <div className="inline-flex rounded-lg border border-white/15 bg-black/20 p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHapticFeedback('light');
                          setIncludeReservesByStrategy((prev) => ({ ...prev, [activeStrategy]: true }));
                        }}
                        aria-pressed={includeReserves}
                        className={`tap-feedback rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                          includeReserves ? 'bg-white/15 text-slate-100' : 'text-muted hover:bg-white/10'
                        }`}
                      >
                        Include reserves
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHapticFeedback('light');
                          setIncludeReservesByStrategy((prev) => ({ ...prev, [activeStrategy]: false }));
                        }}
                        aria-pressed={!includeReserves}
                        className={`tap-feedback rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                          !includeReserves ? 'bg-white/15 text-slate-100' : 'text-muted hover:bg-white/10'
                        }`}
                      >
                        Exclude reserves
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <DealWorkoutCard model={model} strategy={activeStrategy} onApply={applyDealWorkoutScenario} />
          </div>
        </section>
        <section className="grid grid-cols-2 gap-2 max-[359px]:grid-cols-1 sm:grid-cols-2 sm:gap-3 xl:grid-cols-6">
          <KpiCard
            label="Cash to Close"
            value={currencyFormatter.format(cashToCloseValue)}
            winner={activeStrategyLabel}
            secondaryLabel="Total cash invested"
            secondaryValue={currencyFormatter.format(activeOutput.totalCashNeeded)}
            definitions={[
              {
                term: 'Cash to Close',
                description: 'Cash needed at closing only (down payment, closing costs, points, and HELOC close costs). Excludes rehab and one-time setup costs.'
              },
              {
                term: 'Total cash invested',
                description: 'Total all-in cash invested, including rehab and one-time setup items such as furnishing.'
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
            definitions={[
              {
                term: 'IRR (Internal Rate of Return)',
                description: 'The annualized return that accounts for both cash-flow size and timing across the full hold period.'
              },
              {
                term: 'Why it matters',
                description: 'IRR helps compare deals with different timelines and exit profiles, so you can prioritize faster capital velocity and better risk-adjusted outcomes.'
              }
            ]}
          />
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <div className="hidden md:block">
              <StrategyTabs
                active={activeStrategy}
                onChange={setActiveStrategy}
                quickScan={{ title: activeStrategyLabel, notes: activeOutput.notes, points: quickScanPoints }}
                actionSlot={
                  <button
                    type="button"
                    onClick={() => {
                      triggerHapticFeedback('light');
                      setIsStrategyWorkOpen(true);
                    }}
                    className="btn-primary tap-feedback rounded-xl px-3 py-2 text-sm font-medium"
                  >
                    Show work
                  </button>
                }
              />
            </div>
            <section className="hidden grid gap-3 md:grid">
              <StrategyModuleInputs active={activeStrategy} model={model} onChange={updateModel} />
            </section>
            <TimelineCard
              output={result[activeStrategy]}
              assumptions={model.assumptions}
              defaultOpen={Boolean(activeDealId)}
              onAssumptionsChange={(updates) =>
                updateModel((current) => ({ ...current, assumptions: { ...current.assumptions, ...updates } }))
              }
            />
            <StrategyComparison data={result} />
          </div>

          <div className="hidden md:block">
            <DealInputPanel value={model} onChange={updateModel} resolveListingDealName={resolveListingDealName} defaultAdvancedOptionsOpen={Boolean(activeDealId)} />
          </div>
        </div>
      </div>
      {mobileInputSheet ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close inputs"
            className="absolute inset-0 bg-black/70"
            onClick={() => setMobileInputSheet(null)}
          />
          <div className="absolute inset-x-0 bottom-0 w-full max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-t-2xl border border-white/10 bg-surface p-3 pb-6 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">{mobileInputSheet === "core" ? "Core Deal Inputs" : `${activeStrategyLabel} Strategy Inputs`}</p>
              <button
                type="button"
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-muted"
                onClick={() => setMobileInputSheet(null)}
              >
                Done
              </button>
            </div>
            {mobileInputSheet === "core" ? (
              <DealInputPanel value={model} onChange={updateModel} resolveListingDealName={resolveListingDealName} defaultAdvancedOptionsOpen={Boolean(activeDealId)} />
            ) : (
              <StrategyModuleInputs active={activeStrategy} model={model} onChange={updateModel} />
            )}
          </div>
        </div>
      ) : null}

      <footer className="rounded-2xl border border-white/10 bg-panel/60 p-4 text-xs text-muted">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 DealCooker. Created by Dillon Cook. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-3 text-slate-300">
            <Link href="/legal" className="hover:text-white">Legal Center</Link>
            <Link href="/legal/terms" className="hover:text-white">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-white">Privacy</Link>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted/90">
          For educational and informational purposes only. Not financial, legal, tax, or investment advice.
        </p>
      </footer>

      <StrategyWorkLightbox
        open={isStrategyWorkOpen}
        activeStrategy={activeStrategy}
        output={activeOutput}
        onClose={() => setIsStrategyWorkOpen(false)}
      />
    </main>
  );
}
