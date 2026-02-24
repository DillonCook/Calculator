'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { User } from '@supabase/supabase-js';
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
import { createScenarioRecord, encodeScenario, writeScenarios } from '@/lib/scenario-storage';
import { deleteSupabaseScenario, fetchSupabaseScenarios, upsertSupabaseScenario } from '@/lib/cloud-scenarios-sync';
import { decodeDealFromShareParam, encodeDealToShareParam } from '@/lib/share-link';
import { createShortShareLink } from '@/lib/share-links';

import { currencyFormatter, percentFormatter } from '@/lib/formatters';
import { triggerHapticFeedback } from '@/lib/use-haptics';
import { normalizeListingUrl } from '@/lib/listing-link';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';


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




const buildNewDealPayload = (dealName: string): DealInputModel => ({
  ...defaultDealInput,
  purchase: {
    ...defaultDealInput.purchase,
    dealName
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
});

const storedDeals = readDealsFromVault();
const initialDeals =
  storedDeals.length > 0
    ? storedDeals
    : (() => {
        const payload = buildNewDealPayload('New Deal');
        const freshDeal = createDealInVault(payload, payload.purchase.dealName);
        return saveDealToVault(freshDeal);
      })();
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
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [isAuthMenuOpen, setIsAuthMenuOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFeedback, setAuthFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const hasLoadedSupabaseDeals = useRef(false);
  const pushTimerRef = useRef<number | null>(null);
  const queuedPushScenarioIdRef = useRef<string | null>(null);
  const pendingDeleteIdsRef = useRef<Set<string>>(new Set());
  const pendingUpsertIdsRef = useRef<Set<string>>(new Set());
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [fetchedScenarioCount, setFetchedScenarioCount] = useState(0);
  const [lastCloudError, setLastCloudError] = useState<string | null>(null);
  const [cloudHealth, setCloudHealth] = useState<'ok' | 'error' | 'idle'>('idle');
  const [baselineComplete, setBaselineCompleteState] = useState(false);
  const [baselineUpsertsCount, setBaselineUpsertsCount] = useState(0);
  const [prunedLocalCount, setPrunedLocalCount] = useState(0);

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

  const profileImageUrl = useMemo(() => {
    if (!currentUser) return null;

    const metadata = currentUser.user_metadata as { avatar_url?: string; picture?: string } | undefined;
    return metadata?.avatar_url ?? metadata?.picture ?? null;
  }, [currentUser]);

  const profileFallbackLabel = useMemo(() => {
    const email = currentUser?.email?.trim();
    if (email) return email.slice(0, 2).toUpperCase();
    return 'ME';
  }, [currentUser]);

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
      queueScenarioPush(updatedDeal);
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
    if (!authFeedback) return;
    const timer = window.setTimeout(() => setAuthFeedback(null), 4200);
    return () => window.clearTimeout(timer);
  }, [authFeedback]);

  useEffect(() => {
    if (!syncFeedback) return;
    const timer = window.setTimeout(() => setSyncFeedback(null), 3600);
    return () => window.clearTimeout(timer);
  }, [syncFeedback]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setCurrentUser(data.session?.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
      if (!session?.user) {
        hasLoadedSupabaseDeals.current = false;
        pendingDeleteIdsRef.current.clear();
        pendingUpsertIdsRef.current.clear();
        queuedPushScenarioIdRef.current = null;
        setBaselineCompleteState(false);
        setFetchedScenarioCount(0);
        setIsAuthMenuOpen(false);
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updateMotionPreference();
    mediaQuery.addEventListener('change', updateMotionPreference);

    return () => mediaQuery.removeEventListener('change', updateMotionPreference);
  }, []);

  const getUnixTime = (timestamp: string) => {
    const parsed = Date.parse(timestamp);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const getBaselineKey = (userId: string) => `dc_cloud_baseline_complete:${userId}`;

  const isBaselineComplete = (userId: string) => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(getBaselineKey(userId)) === '1';
  };

  const setBaselineComplete = (userId: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(getBaselineKey(userId), '1');
  };

  const mergeScenariosByLatest = (localDeals: ScenarioRecord[], cloudDeals: ScenarioRecord[]) => {
    const mergedMap = new Map<string, ScenarioRecord>();

    for (const scenario of [...localDeals, ...cloudDeals]) {
      const existing = mergedMap.get(scenario.scenarioId);
      if (!existing || getUnixTime(scenario.updatedAt) > getUnixTime(existing.updatedAt)) {
        mergedMap.set(scenario.scenarioId, scenario);
      }
    }

    return Array.from(mergedMap.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  };

  const areScenarioListsEqual = (left: ScenarioRecord[], right: ScenarioRecord[]) => {
    if (left.length != right.length) return false;

    return left.every((scenario, index) => {
      const peer = right[index];
      if (!peer) return false;

      return scenario.scenarioId === peer.scenarioId && scenario.updatedAt === peer.updatedAt && scenario.dealName === peer.dealName;
    });
  };

  const reportSupabaseError = (error: unknown, operation: 'fetch' | 'upsert' | 'delete') => {
    const details =
      error && typeof error === 'object'
        ? { status: (error as { status?: unknown }).status, message: (error as { message?: unknown }).message }
        : { status: undefined, message: String(error) };

    console.error(`Supabase scenarios ${operation} error:`, { details, error });
    setLastCloudError(operation);
    setCloudHealth('error');
    setSyncFeedback('Cloud sync error while saving Deal Vault.');
  };

  const syncScenarioUpsert = async (scenario: ScenarioRecord) => {
    if (!currentUser?.id) return false;
    if (pendingDeleteIdsRef.current.has(scenario.scenarioId)) return false;

    const error = await upsertSupabaseScenario(currentUser.id, scenario);
    if (error) {
      reportSupabaseError(error, 'upsert');
      return false;
    }

    pendingUpsertIdsRef.current.delete(scenario.scenarioId);
    setLastCloudError(null);
    setCloudHealth('ok');
    return true;
  };

  const syncScenarioDelete = async (scenarioId: string) => {
    if (!currentUser?.id) return false;

    const error = await deleteSupabaseScenario(currentUser.id, scenarioId);
    if (error) {
      reportSupabaseError(error, 'delete');
      return false;
    }

    pendingUpsertIdsRef.current.delete(scenarioId);
    setLastCloudError(null);
    setCloudHealth('ok');
    return true;
  };

  function queueScenarioPush(scenario: ScenarioRecord) {
    if (!currentUser?.id) return;

    pendingUpsertIdsRef.current.add(scenario.scenarioId);
    queuedPushScenarioIdRef.current = scenario.scenarioId;

    if (pushTimerRef.current) {
      window.clearTimeout(pushTimerRef.current);
    }

    pushTimerRef.current = window.setTimeout(() => {
      if (!queuedPushScenarioIdRef.current || pendingDeleteIdsRef.current.has(queuedPushScenarioIdRef.current)) {
        pushTimerRef.current = null;
        queuedPushScenarioIdRef.current = null;
        return;
      }

      void syncScenarioUpsert(scenario);
      if (process.env.NODE_ENV !== 'production') {
        console.info('[DealVault Debug]', { mode: 'push', scenarioId: scenario.scenarioId, pushCount: 1 });
      }
      pushTimerRef.current = null;
      queuedPushScenarioIdRef.current = null;
    }, 1200);
  }

  const saveDealAs = (dealName: string) => {
    const record = createDealInVault(model, dealName);
    const next = saveDealToVault(record);
    setModel(record.payload);
    setDeals(next);
    setActiveDealId(record.scenarioId);
    queueScenarioPush(record);
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
    const updatedDeal = { ...activeDeal, dealName, payload, updatedAt: new Date().toISOString() };
    const next = saveDealToVault(updatedDeal);
    setDeals(next);
    queueScenarioPush(updatedDeal);
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

    const payload = buildNewDealPayload(candidateName);

    const nextDeal = createDealInVault(payload, candidateName);
    const next = saveDealToVault(nextDeal);
    setDeals(next);
    setActiveDealId(nextDeal.scenarioId);
    setModel(nextDeal.payload);
    queueScenarioPush(nextDeal);
    setSaveStatus('saved');
  };

  const openRecentScenario = (scenarioId: string) => {
    const scenario = deals.find((entry) => entry.scenarioId === scenarioId);
    if (!scenario) return;
    loadScenario(scenario.payload, scenario.scenarioId);
  };

  const removeScenario = () => {
    if (!activeDeal) return;

    const scenarioId = activeDeal.scenarioId;
    pendingUpsertIdsRef.current.delete(scenarioId);
    pendingDeleteIdsRef.current.add(scenarioId);

    if (pushTimerRef.current && queuedPushScenarioIdRef.current === scenarioId) {
      window.clearTimeout(pushTimerRef.current);
      pushTimerRef.current = null;
      queuedPushScenarioIdRef.current = null;
    }

    const next = removeDealFromVault(scenarioId);

    if (next.length === 0) {
      const payload = buildNewDealPayload('New Deal');
      const nextDeal = createDealInVault(payload, payload.purchase.dealName);
      const nextDeals = saveDealToVault(nextDeal);
      setDeals(nextDeals);
      setActiveDealId(nextDeal.scenarioId);
      setModel(nextDeal.payload);
      queueScenarioPush(nextDeal);
      setSaveStatus('saved');
    } else {
      setDeals(next);
      setActiveDealId('');
      setSaveStatus('idle');
    }
    void syncScenarioDelete(scenarioId);

    void (async () => {
      const ok = await syncScenarioDelete(scenarioId);
      if (ok) {
        pendingDeleteIdsRef.current.delete(scenarioId);
        return;
      }

      if (process.env.NODE_ENV !== 'production') {
        console.info('[DealVault Debug]', { mode: 'pending-delete-retained', scenarioId });
      }
    })();
  };

  const resolveListingDealName = useCallback(async () => null, []);

  const shareCurrentDeal = async () => {
    if (currentUser?.id) {
      const { slug, error } = await createShortShareLink({
        ownerId: currentUser.id,
        scenarioId: activeDealId || undefined,
        payloadSnapshot: model
      });

      if (!error && slug) {
        const shortUrl = `${window.location.origin}/s/${slug}`;
        try {
          await navigator.clipboard.writeText(shortUrl);
          triggerHapticFeedback('success');
          setShareFeedback({ tone: 'success', message: 'Copied share link.' });
          return;
        } catch {
          setShareFeedback({ tone: 'error', message: 'Copy failed. Use this link manually.', fallbackUrl: shortUrl });
          return;
        }
      }

      console.error('Supabase share create error:', error);
    }

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

  const signInWithGoogle = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setAuthBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      setAuthBusy(false);
      setShareFeedback({ tone: 'error', message: error.message });
      return;
    }
  };

  const createAccountWithEmail = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthFeedback({ tone: 'error', message: 'Enter both email and password to create an account.' });
      return;
    }

    setAuthBusy(true);
    const { error } = await supabase.auth.signUp({
      email: authEmail.trim(),
      password: authPassword,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });
    setAuthBusy(false);

    if (error) {
      setAuthFeedback({ tone: 'error', message: error.message });
      return;
    }

    setAuthFeedback({ tone: 'success', message: 'Account created. Check your email to confirm sign in.' });
    setAuthPassword('');
  };

  const signOut = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setAuthBusy(true);
    const { error } = await supabase.auth.signOut();
    setAuthBusy(false);

    if (error) {
      setShareFeedback({ tone: 'error', message: error.message });
      return;
    }

    hasLoadedSupabaseDeals.current = false;
    pendingDeleteIdsRef.current.clear();
    pendingUpsertIdsRef.current.clear();
    queuedPushScenarioIdRef.current = null;
    setBaselineCompleteState(false);
    setCloudHealth('idle');
    setCurrentUser(null);
    setIsAuthMenuOpen(false);
  };

  const pullAndMergeCloudDeals = useCallback(async () => {
    if (!currentUser?.id) return;

    const localDeals = readDealsFromVault();
    const { scenarios: fetchedCloudDeals, error } = await fetchSupabaseScenarios(currentUser.id);

    if (error) {
      reportSupabaseError(error, 'fetch');
      return;
    }

    let baselineDone = isBaselineComplete(currentUser.id);

    if (!baselineDone && fetchedCloudDeals.length > 0) {
      // Another device has already established cloud state for this user.
      // Mark baseline complete on this device to prevent stale local backfill resurrection.
      setBaselineComplete(currentUser.id);
      baselineDone = true;
    }

    setBaselineCompleteState(baselineDone);

    for (const scenarioId of Array.from(pendingDeleteIdsRef.current)) {
      const ok = await syncScenarioDelete(scenarioId);
      if (ok) {
        pendingDeleteIdsRef.current.delete(scenarioId);
      }
    }

    const cloudDeals = fetchedCloudDeals.filter((scenario) => !pendingDeleteIdsRef.current.has(scenario.scenarioId));
    const cloudMap = new Map(cloudDeals.map((scenario) => [scenario.scenarioId, scenario]));

    const upsertCandidates = localDeals.filter((scenario) => {
      const cloudScenario = cloudMap.get(scenario.scenarioId);
      if (!cloudScenario) {
        return !baselineDone;
      }

      return getUnixTime(scenario.updatedAt) > getUnixTime(cloudScenario.updatedAt);
    });

    let baselineUpserts = 0;
    let upsertError = false;

    for (const scenario of upsertCandidates) {
      const ok = await syncScenarioUpsert(scenario);
      if (ok) {
        baselineUpserts += 1;
      } else {
        upsertError = true;
      }
    }

    let mergedDeals: ScenarioRecord[];
    let prunedLocal = 0;

    if (!baselineDone && !upsertError) {
      mergedDeals = mergeScenariosByLatest(localDeals, cloudDeals);
      setBaselineComplete(currentUser.id);
      setBaselineCompleteState(true);
    } else if (baselineDone) {
      const pendingUpsertIds = pendingUpsertIdsRef.current;
      const cloudIds = new Set(cloudDeals.map((scenario) => scenario.scenarioId));
      const localById = new Map(localDeals.map((scenario) => [scenario.scenarioId, scenario]));

      const cloudResolved = cloudDeals.map((cloudScenario) => {
        const localScenario = localById.get(cloudScenario.scenarioId);
        if (!localScenario) return cloudScenario;

        return getUnixTime(localScenario.updatedAt) > getUnixTime(cloudScenario.updatedAt) ? localScenario : cloudScenario;
      });

      const pendingLocalDeals = localDeals.filter(
        (scenario) => pendingUpsertIds.has(scenario.scenarioId) && !cloudIds.has(scenario.scenarioId)
      );

      mergedDeals = [...cloudResolved, ...pendingLocalDeals].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      prunedLocal = localDeals.filter((scenario) => !cloudIds.has(scenario.scenarioId) && !pendingUpsertIds.has(scenario.scenarioId)).length;
    } else {
      mergedDeals = mergeScenariosByLatest(localDeals, cloudDeals);
    }

    writeScenarios(mergedDeals);

    if (!areScenarioListsEqual(deals, mergedDeals)) {
      setDeals(mergedDeals);
    }

    if (mergedDeals.length > 0) {
      const nextActiveDeal = mergedDeals.find((scenario) => scenario.scenarioId === activeDealId) ?? mergedDeals[0];
      if (nextActiveDeal && nextActiveDeal.scenarioId !== activeDealId) {
        setActiveDealId(nextActiveDeal.scenarioId);
        setModel(nextActiveDeal.payload);
      } else if (nextActiveDeal) {
        setModel(nextActiveDeal.payload);
      }
    }

    setFetchedScenarioCount(cloudDeals.length);
    setBaselineUpsertsCount(baselineUpserts);
    setPrunedLocalCount(prunedLocal);
    setCloudHealth('ok');

    if (process.env.NODE_ENV !== 'production') {
      console.info('[DealVault Debug]', {
        mode: baselineDone ? 'pull-merge' : 'baseline-migration',
        email: currentUser.email ?? null,
        userId: currentUser.id,
        baselineComplete: baselineDone,
        cloudCount: cloudDeals.length,
        localCount: localDeals.length,
        mergedCount: mergedDeals.length,
        baselineUpsertsCount: baselineUpserts,
        prunedLocalCount: prunedLocal,
        pendingDeletes: pendingDeleteIdsRef.current.size,
        lastSupabaseError: lastCloudError
      });
    }
  }, [activeDealId, currentUser?.email, currentUser?.id, deals, lastCloudError]);

  useEffect(() => {
    if (!currentUser?.id || hasLoadedSupabaseDeals.current) return;

    hasLoadedSupabaseDeals.current = true;
    void pullAndMergeCloudDeals();

    if (process.env.NODE_ENV !== 'production') {
      console.info('[DealVault Debug]', {
        mode: 'initial-fetch',
        email: currentUser.email ?? null,
        userId: currentUser.id,
        baselineComplete: isBaselineComplete(currentUser.id)
      });
    }
  }, [currentUser?.id, currentUser?.email, pullAndMergeCloudDeals]);

  useEffect(() => {
    if (!currentUser?.id) return;

    const poll = window.setInterval(() => {
      void pullAndMergeCloudDeals();
    }, 12000);

    const handleVisibilitySync = () => {
      if (!document.hidden) {
        void pullAndMergeCloudDeals();
      }
    };

    const handleFocusSync = () => {
      void pullAndMergeCloudDeals();
    };

    window.addEventListener('focus', handleFocusSync);
    document.addEventListener('visibilitychange', handleVisibilitySync);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener('focus', handleFocusSync);
      document.removeEventListener('visibilitychange', handleVisibilitySync);
    };
  }, [currentUser?.id, pullAndMergeCloudDeals]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || !currentUser?.id) return;

    console.info('[DealVault Debug]', {
      email: currentUser.email ?? null,
      userId: currentUser.id,
      baselineComplete,
      cloudCount: fetchedScenarioCount,
      localCount: deals.length,
      mergedCount: deals.length,
      baselineUpsertsCount,
      prunedLocalCount,
      lastSupabaseError: lastCloudError
    });
  }, [
    baselineComplete,
    baselineUpsertsCount,
    currentUser?.email,
    currentUser?.id,
    deals.length,
    fetchedScenarioCount,
    lastCloudError,
    prunedLocalCount
  ]);

  useEffect(() => {
    return () => {
      if (pushTimerRef.current) {
        window.clearTimeout(pushTimerRef.current);
      }
      queuedPushScenarioIdRef.current = null;
    };
  }, []);

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
      queueScenarioPush(imported);
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
                <div className="relative flex items-start justify-between gap-3">
                  <h1 className="text-2xl font-semibold md:text-3xl" aria-label="DealCooker">
                    <span className="brandDeal">Deal</span>
                    <span className="brandCooker">Cooker</span>
                  </h1>
                  {currentUser ? (
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 overflow-hidden rounded-full border border-white/20 bg-white/10" aria-label="Profile photo">
                        {profileImageUrl ? (
                          <img src={profileImageUrl} alt="Signed-in user profile photo" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-100">{profileFallbackLabel}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={signOut}
                        disabled={authBusy || !isSupabaseConfigured}
                        className="btn-primary min-h-8 rounded-lg px-2.5 py-1 text-[11px] font-medium sm:text-xs disabled:opacity-60"
                      >
                        Sign out
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsAuthMenuOpen((value) => !value)}
                        className="btn-primary min-h-8 rounded-lg px-2.5 py-1 text-[11px] font-medium sm:text-xs"
                      >
                        Sign in
                      </button>
                      {isAuthMenuOpen ? (
                        <div className="absolute right-0 top-10 z-40 w-72 rounded-xl border border-white/15 bg-surface/95 p-3 shadow-soft backdrop-blur">
                          <button
                            type="button"
                            onClick={signInWithGoogle}
                            disabled={authBusy || !isSupabaseConfigured}
                            className="btn-primary w-full rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-60"
                          >
                            Continue with Google
                          </button>
                          <div className="mt-3 space-y-2">
                            <p className="text-xs text-muted">Create account with email</p>
                            <input
                              type="email"
                              value={authEmail}
                              onChange={(event) => setAuthEmail(event.target.value)}
                              placeholder="you@example.com"
                              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs outline-none ring-0 placeholder:text-muted/70 focus:border-accent/60"
                            />
                            <input
                              type="password"
                              value={authPassword}
                              onChange={(event) => setAuthPassword(event.target.value)}
                              placeholder="Create password"
                              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs outline-none ring-0 placeholder:text-muted/70 focus:border-accent/60"
                            />
                            <button
                              type="button"
                              onClick={createAccountWithEmail}
                              disabled={authBusy || !isSupabaseConfigured}
                              className="btn-primary w-full rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-60"
                            >
                              Create account with email
                            </button>
                          </div>
                          {!isSupabaseConfigured ? (
                            <p className="mt-2 text-[11px] text-muted/90">
                              Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable authentication.
                            </p>
                          ) : null}
                          {authFeedback ? (
                            <p className={`mt-2 text-[11px] ${authFeedback.tone === 'success' ? 'text-accent' : 'text-red-300'}`}>{authFeedback.message}</p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
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

            <div className="flex items-center gap-2 text-[11px] text-muted sm:text-xs">
              <span>Cloud:</span>
              <span className={`rounded-full px-2 py-0.5 ${cloudHealth === 'ok' ? 'bg-accent/20 text-accent' : cloudHealth === 'error' ? 'bg-red-500/20 text-red-200' : 'bg-white/10 text-muted'}`}>
                {cloudHealth === 'ok' ? 'OK' : cloudHealth === 'error' ? 'Error' : 'Idle'}
              </span>
            </div>

            {syncFeedback ? (
              <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-red-400/50 bg-red-500/15 px-3 py-2 text-xs text-red-100 shadow-soft sm:text-sm" role="status">
                {syncFeedback}
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
