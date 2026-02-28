'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { User } from '@supabase/supabase-js';
import { DealInputPanel } from '@/components/dashboard/deal-input-panel';
import { DealWorkoutCard } from '@/components/dashboard/deal-workout-card';
import { DealsVaultPanel } from '@/components/dashboard/scenario-corner';
import { StrategyComparison } from '@/components/dashboard/strategy-comparison';
import { StrategyModuleInputs } from '@/components/dashboard/strategy-module-inputs';
import { OnboardingTour, type OnboardingStep } from '@/components/dashboard/onboarding-tour';
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
import { getNegativeValueStyle, type NegativeValueKind } from '@/lib/negative-value-color';
import { triggerHapticFeedback } from '@/lib/use-haptics';
import { normalizeListingUrl } from '@/lib/listing-link';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';


const activeStrategyLabels: Record<StrategyKey, string> = {
  purchase: 'Commercial',
  longTerm: 'Long-Term',
  airbnb: 'Airbnb',
  padSplit: 'PadSplit',
  brrrr: 'BRRRR',
  flip: 'Flip'
};

const strategyKeyOrder: StrategyKey[] = ['purchase', 'longTerm', 'airbnb', 'padSplit', 'brrrr', 'flip'];
const isStrategyKey = (value: unknown): value is StrategyKey =>
  typeof value === 'string' && strategyKeyOrder.includes(value as StrategyKey);

const quickScanDetails: Record<StrategyKey, string[]> = {
  purchase: [
    'Retail / strip-plaza underwriting built around leased square footage and annual $/sq ft rent.',
    'Model vacancy, credit loss, and TI/leasing reserves so monthly NOI is conservative.'
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

type CommercialDigestKey =
  | 'leased-sf'
  | 'physical-occ'
  | 'break-even-occ'
  | 'debt-yield'
  | 'annual-pgi'
  | 'annual-egi'
  | 'annual-opex'
  | 'annual-noi'
  | 'annual-debt'
  | 'risk-drag';

type LongTermTurnaroundDigestKey =
  | 'stab-gross-income'
  | 'stab-egi'
  | 'stab-noi'
  | 'stab-cf'
  | 'stab-cf-no-reserves'
  | 'stab-invested'
  | 'stab-dscr'
  | 'stab-cap-rate'
  | 'stab-coc'
  | 'stab-irr'
  | 'stab-implied-value'
  | 'stab-equity-created';

interface DigestItem<K extends string> {
  key: K;
  label: string;
  value: string;
  rawValue?: number;
  rawKind?: NegativeValueKind;
}

const COMMERCIAL_OUTPUT_ORDER_STORAGE_KEY = 'dealcooker-commercial-output-order:v1';
const LONG_TERM_TURNAROUND_OUTPUT_ORDER_STORAGE_KEY = 'dealcooker-long-term-turnaround-output-order:v1';
const SETTINGS_DEFAULT_STRATEGY_STORAGE_KEY = 'dealcooker-default-strategy:v1';
const SETTINGS_LIGHT_MODE_STORAGE_KEY = 'dealcooker-light-mode:v1';
const defaultCommercialDigestOrder: CommercialDigestKey[] = [
  'leased-sf',
  'physical-occ',
  'break-even-occ',
  'debt-yield',
  'annual-pgi',
  'annual-egi',
  'annual-opex',
  'annual-noi',
  'annual-debt',
  'risk-drag'
];
const defaultLongTermTurnaroundDigestOrder: LongTermTurnaroundDigestKey[] = [
  'stab-gross-income',
  'stab-egi',
  'stab-noi',
  'stab-cf',
  'stab-cf-no-reserves',
  'stab-invested',
  'stab-dscr',
  'stab-cap-rate',
  'stab-coc',
  'stab-irr',
  'stab-implied-value',
  'stab-equity-created'
];
const commercialDigestKeySet = new Set<CommercialDigestKey>(defaultCommercialDigestOrder);
const longTermTurnaroundDigestKeySet = new Set<LongTermTurnaroundDigestKey>(defaultLongTermTurnaroundDigestOrder);

const normalizeCommercialDigestOrder = (value: unknown): CommercialDigestKey[] => {
  const normalized: CommercialDigestKey[] = [];
  const input = Array.isArray(value) ? value : [];

  for (const rawKey of input) {
    if (typeof rawKey !== 'string') continue;
    const key = rawKey as CommercialDigestKey;
    if (!commercialDigestKeySet.has(key)) continue;
    if (normalized.includes(key)) continue;
    normalized.push(key);
  }

  for (const fallbackKey of defaultCommercialDigestOrder) {
    if (!normalized.includes(fallbackKey)) normalized.push(fallbackKey);
  }

  return normalized;
};

const normalizeLongTermTurnaroundDigestOrder = (value: unknown): LongTermTurnaroundDigestKey[] => {
  const normalized: LongTermTurnaroundDigestKey[] = [];
  const input = Array.isArray(value) ? value : [];

  for (const rawKey of input) {
    if (typeof rawKey !== 'string') continue;
    const key = rawKey as LongTermTurnaroundDigestKey;
    if (!longTermTurnaroundDigestKeySet.has(key)) continue;
    if (normalized.includes(key)) continue;
    normalized.push(key);
  }

  for (const fallbackKey of defaultLongTermTurnaroundDigestOrder) {
    if (!normalized.includes(fallbackKey)) normalized.push(fallbackKey);
  }

  return normalized;
};

const ONBOARDING_STORAGE_KEY = 'dealcooker-onboarding-seen:v1';
const onboardingSteps: OnboardingStep[] = [
  {
    id: 'vault',
    title: 'Welcome to DealCooker',
    body: 'Thanks for being here. This Deal Vault is where you save, rename, and reload scenarios quickly so every deal stays organized.'
  },
  {
    id: 'signin',
    title: 'Sign In for Cross-Device Workflow',
    body: 'Use Sign in in the top-right to connect your account. Signed-in deals sync across devices and let you create shorter share links for cleaner handoffs.'
  },
  {
    id: 'core',
    title: 'Start with Core Inputs',
    body: 'Begin in Core Purchase, Financing, & Expenses. These values feed every strategy, so one clean baseline drives all downstream comparisons.'
  },
  {
    id: 'strategy',
    title: 'Then Tune Each Strategy',
    body: 'Tap a strategy tab, then edit Strategy Inputs for that exact plan. Each strategy keeps its own assumptions so you can compare outcomes side by side.'
  },
  {
    id: 'irr',
    title: 'Use the IRR Stream',
    body: 'IRR factors in how long owners hold a property and the exit proceeds at sale. That gives you a true apples-to-apples comparison against other deals with different timelines.'
  }
];




const buildNewDealPayload = (dealName: string): DealInputModel => ({
  ...defaultDealInput,
  purchase: {
    ...defaultDealInput.purchase,
    dealName
  },
  commercial: { ...defaultDealInput.commercial },
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
const defaultNewDealStrategyFallback: StrategyKey = 'longTerm';

export default function HomePage() {
  const [model, setModel] = useState(initialActiveDeal?.payload ?? defaultDealInput);
  const [activeStrategy, setActiveStrategy] = useState<StrategyKey>(defaultNewDealStrategyFallback);
  const [deals, setDeals] = useState<ScenarioRecord[]>(initialDeals);
  const [activeDealId, setActiveDealId] = useState(initialActiveDeal?.scenarioId ?? '');
  const [defaultNewDealStrategy, setDefaultNewDealStrategy] = useState<StrategyKey>(defaultNewDealStrategyFallback);
  const [isLightMode, setIsLightMode] = useState(false);
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
  const [commercialDigestOrder, setCommercialDigestOrder] = useState<CommercialDigestKey[]>(defaultCommercialDigestOrder);
  const [isCommercialOrderEditorOpen, setIsCommercialOrderEditorOpen] = useState(false);
  const [longTermTurnaroundDigestOrder, setLongTermTurnaroundDigestOrder] =
    useState<LongTermTurnaroundDigestKey[]>(defaultLongTermTurnaroundDigestOrder);
  const [isLongTermTurnaroundOrderEditorOpen, setIsLongTermTurnaroundOrderEditorOpen] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<{ tone: 'success' | 'error'; message: string; fallbackUrl?: string } | null>(null);
  const [mobileInputView, setMobileInputView] = useState<'core' | 'strategy'>('core');
  const [isMobileCoreInputsMinimized, setIsMobileCoreInputsMinimized] = useState(false);
  const [isMobileStrategyInputsMinimized, setIsMobileStrategyInputsMinimized] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [showAllCommercialMobileOutputs, setShowAllCommercialMobileOutputs] = useState(false);
  const [showAllLongTermTurnaroundMobileOutputs, setShowAllLongTermTurnaroundMobileOutputs] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [isAuthMenuOpen, setIsAuthMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingStepIndex, setOnboardingStepIndex] = useState(0);
  const dealVaultRef = useRef<HTMLDivElement | null>(null);
  const authControlsRef = useRef<HTMLDivElement | null>(null);
  const settingsControlsRef = useRef<HTMLDivElement | null>(null);
  const mobileCoreSectionRef = useRef<HTMLDivElement | null>(null);
  const desktopCoreSectionRef = useRef<HTMLDivElement | null>(null);
  const mobileStrategyTabsRef = useRef<HTMLDivElement | null>(null);
  const desktopStrategyTabsRef = useRef<HTMLDivElement | null>(null);
  const irrStreamRef = useRef<HTMLDivElement | null>(null);

  const result = useMemo(() => calculateDeal(model), [model]);
  const exportPayload = useMemo(() => encodeScenario(createScenarioRecord(model)), [model]);

  const activeOutput = result[activeStrategy];
  const commercialSummary = activeStrategy === 'purchase' ? activeOutput.commercialSummary : undefined;
  const longTermTurnaroundSummary = activeStrategy === 'longTerm' ? activeOutput.longTermTurnaroundSummary : undefined;
  const baseCommercialDigestItems = useMemo<DigestItem<CommercialDigestKey>[]>(() => {
    if (!commercialSummary) return [];

    return [
      {
        key: 'leased-sf' as CommercialDigestKey,
        label: 'Leased SF',
        value: `${commercialSummary.occupiedSqft.toLocaleString()} / ${commercialSummary.grossLeasableAreaSqft.toLocaleString()}`
      },
      {
        key: 'physical-occ' as CommercialDigestKey,
        label: 'Physical Occupancy',
        value: percentFormatter.format(commercialSummary.physicalOccupancyPercent),
        rawValue: commercialSummary.physicalOccupancyPercent,
        rawKind: 'percent'
      },
      {
        key: 'break-even-occ' as CommercialDigestKey,
        label: 'Break-even Occupancy',
        value: percentFormatter.format(commercialSummary.breakEvenOccupancyPercent),
        rawValue: commercialSummary.breakEvenOccupancyPercent,
        rawKind: 'percent'
      },
      {
        key: 'debt-yield' as CommercialDigestKey,
        label: 'Debt Yield',
        value: percentFormatter.format(commercialSummary.debtYield),
        rawValue: commercialSummary.debtYield,
        rawKind: 'percent'
      },
      {
        key: 'annual-pgi' as CommercialDigestKey,
        label: 'Annual Potential Gross',
        value: currencyFormatter.format(commercialSummary.annualPotentialGrossIncome),
        rawValue: commercialSummary.annualPotentialGrossIncome,
        rawKind: 'currency'
      },
      {
        key: 'annual-egi' as CommercialDigestKey,
        label: 'Annual Effective Gross',
        value: currencyFormatter.format(commercialSummary.annualEffectiveGrossIncome),
        rawValue: commercialSummary.annualEffectiveGrossIncome,
        rawKind: 'currency'
      },
      {
        key: 'annual-opex' as CommercialDigestKey,
        label: 'Annual Operating Expenses',
        value: currencyFormatter.format(commercialSummary.annualOperatingExpenses),
        rawValue: commercialSummary.annualOperatingExpenses,
        rawKind: 'currency'
      },
      {
        key: 'annual-noi' as CommercialDigestKey,
        label: 'Annual NOI',
        value: currencyFormatter.format(commercialSummary.annualNoi),
        rawValue: commercialSummary.annualNoi,
        rawKind: 'currency'
      },
      {
        key: 'annual-debt' as CommercialDigestKey,
        label: 'Annual Debt Service',
        value: currencyFormatter.format(commercialSummary.annualDebtService),
        rawValue: commercialSummary.annualDebtService,
        rawKind: 'currency'
      },
      {
        key: 'risk-drag' as CommercialDigestKey,
        label: 'Annual Vacancy + Credit Loss',
        value: currencyFormatter.format(commercialSummary.annualEconomicVacancyLoss + commercialSummary.annualCreditLoss),
        rawValue: commercialSummary.annualEconomicVacancyLoss + commercialSummary.annualCreditLoss,
        rawKind: 'currency'
      }
    ];
  }, [commercialSummary]);
  const commercialDigestItems = useMemo(() => {
    const lookup = new Map(baseCommercialDigestItems.map((item) => [item.key, item]));
    return normalizeCommercialDigestOrder(commercialDigestOrder)
      .map((key) => lookup.get(key))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [baseCommercialDigestItems, commercialDigestOrder]);
  const mobileCommercialOutputDefaultCount = 4;
  const mobileCommercialDigestItems = showAllCommercialMobileOutputs
    ? commercialDigestItems
    : commercialDigestItems.slice(0, mobileCommercialOutputDefaultCount);
  const hasHiddenCommercialMobileOutputs = commercialDigestItems.length > mobileCommercialOutputDefaultCount;
  const baseLongTermTurnaroundDigestItems = useMemo<DigestItem<LongTermTurnaroundDigestKey>[]>(() => {
    if (!longTermTurnaroundSummary?.enabled) return [];

    return [
      {
        key: 'stab-gross-income' as LongTermTurnaroundDigestKey,
        label: 'Stabilized Gross Income',
        value: currencyFormatter.format(longTermTurnaroundSummary.stabilizedGrossIncomeMonthly),
        rawValue: longTermTurnaroundSummary.stabilizedGrossIncomeMonthly,
        rawKind: 'currency'
      },
      {
        key: 'stab-egi' as LongTermTurnaroundDigestKey,
        label: 'Effective Gross Income',
        value: currencyFormatter.format(longTermTurnaroundSummary.effectiveGrossIncomeMonthly),
        rawValue: longTermTurnaroundSummary.effectiveGrossIncomeMonthly,
        rawKind: 'currency'
      },
      {
        key: 'stab-noi' as LongTermTurnaroundDigestKey,
        label: 'NOI (Stabilized)',
        value: currencyFormatter.format(longTermTurnaroundSummary.noiMonthly),
        rawValue: longTermTurnaroundSummary.noiMonthly,
        rawKind: 'currency'
      },
      {
        key: 'stab-cf' as LongTermTurnaroundDigestKey,
        label: 'Cash Flow (Pre-Tax)',
        value: currencyFormatter.format(longTermTurnaroundSummary.cashFlowPreTaxMonthly),
        rawValue: longTermTurnaroundSummary.cashFlowPreTaxMonthly,
        rawKind: 'currency'
      },
      {
        key: 'stab-cf-no-reserves' as LongTermTurnaroundDigestKey,
        label: 'Cash Flow excl. Reserves',
        value: currencyFormatter.format(longTermTurnaroundSummary.cashFlowExcludingReservesMonthly),
        rawValue: longTermTurnaroundSummary.cashFlowExcludingReservesMonthly,
        rawKind: 'currency'
      },
      {
        key: 'stab-invested' as LongTermTurnaroundDigestKey,
        label: 'Total Cash Invested',
        value: currencyFormatter.format(longTermTurnaroundSummary.totalCashInvested),
        rawValue: longTermTurnaroundSummary.totalCashInvested,
        rawKind: 'currency'
      },
      {
        key: 'stab-dscr' as LongTermTurnaroundDigestKey,
        label: 'DSCR (Stabilized)',
        value: longTermTurnaroundSummary.dscr.toFixed(2),
        rawValue: longTermTurnaroundSummary.dscr,
        rawKind: 'ratio'
      },
      {
        key: 'stab-cap-rate' as LongTermTurnaroundDigestKey,
        label: 'Cap Rate (Stabilized)',
        value: percentFormatter.format(longTermTurnaroundSummary.capRate),
        rawValue: longTermTurnaroundSummary.capRate,
        rawKind: 'percent'
      },
      {
        key: 'stab-coc' as LongTermTurnaroundDigestKey,
        label: 'Cash-on-Cash (Stabilized)',
        value: percentFormatter.format(longTermTurnaroundSummary.cashOnCashReturn),
        rawValue: longTermTurnaroundSummary.cashOnCashReturn,
        rawKind: 'percent'
      },
      {
        key: 'stab-irr' as LongTermTurnaroundDigestKey,
        label: 'IRR (Stabilized)',
        value: percentFormatter.format(longTermTurnaroundSummary.irr),
        rawValue: longTermTurnaroundSummary.irr,
        rawKind: 'percent'
      },
      {
        key: 'stab-implied-value' as LongTermTurnaroundDigestKey,
        label: 'Implied Value @ Exit Cap',
        value: currencyFormatter.format(longTermTurnaroundSummary.impliedValueAtExitCap),
        rawValue: longTermTurnaroundSummary.impliedValueAtExitCap,
        rawKind: 'currency'
      },
      {
        key: 'stab-equity-created' as LongTermTurnaroundDigestKey,
        label: 'Equity Created',
        value: currencyFormatter.format(longTermTurnaroundSummary.equityCreated),
        rawValue: longTermTurnaroundSummary.equityCreated,
        rawKind: 'currency'
      }
    ];
  }, [longTermTurnaroundSummary]);
  const longTermTurnaroundDigestItems = useMemo(() => {
    const lookup = new Map(baseLongTermTurnaroundDigestItems.map((item) => [item.key, item]));
    return normalizeLongTermTurnaroundDigestOrder(longTermTurnaroundDigestOrder)
      .map((key) => lookup.get(key))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [baseLongTermTurnaroundDigestItems, longTermTurnaroundDigestOrder]);
  const mobileLongTermTurnaroundOutputDefaultCount = 4;
  const mobileLongTermTurnaroundDigestItems = showAllLongTermTurnaroundMobileOutputs
    ? longTermTurnaroundDigestItems
    : longTermTurnaroundDigestItems.slice(0, mobileLongTermTurnaroundOutputDefaultCount);
  const hasHiddenLongTermTurnaroundMobileOutputs = longTermTurnaroundDigestItems.length > mobileLongTermTurnaroundOutputDefaultCount;
  const activeStrategyLabel = activeStrategyLabels[activeStrategy];
  const quickScanPoints = quickScanDetails[activeStrategy];
  const isFlipStrategy = activeStrategy === 'flip';
  const supportsReserveToggle =
    activeStrategy === 'purchase' ||
    activeStrategy === 'longTerm' ||
    activeStrategy === 'airbnb' ||
    activeStrategy === 'padSplit' ||
    activeStrategy === 'brrrr';
  const includeReserves = includeReservesByStrategy[activeStrategy];
  const priorityMetricValue = isFlipStrategy
    ? activeOutput.saleProceeds ?? 0
    : supportsReserveToggle && !includeReserves
      ? activeOutput.monthlyCashFlowExcludingReserves ?? activeOutput.monthlyCashFlow
      : activeOutput.monthlyCashFlow;
  const priorityMetricTitle = isFlipStrategy ? 'Net Sale Proceeds' : 'Monthly Cash Flow';
  const priorityMetricSubtitle =
    activeStrategy === 'purchase'
      ? 'Includes TI and leasing reserves for conservative strip-plaza underwriting'
      : isFlipStrategy
        ? 'Projected one-time proceeds after rehab, sale costs, and carry costs'
        : 'Includes maintenance and CapEx reserves for a conservative monthly cash flow view';
  const priorityMetricNegativeStyle = getNegativeValueStyle(priorityMetricValue, { kind: 'currency' });

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

  const moveCommercialDigestItem = (fromIndex: number, toIndex: number) => {
    setCommercialDigestOrder((current) => {
      const next = [...normalizeCommercialDigestOrder(current)];
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= next.length || toIndex >= next.length) return next;

      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };
  const moveLongTermTurnaroundDigestItem = (fromIndex: number, toIndex: number) => {
    setLongTermTurnaroundDigestOrder((current) => {
      const next = [...normalizeLongTermTurnaroundDigestOrder(current)];
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= next.length || toIndex >= next.length) return next;

      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };


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

  const handleStrategyChange = (nextStrategy: StrategyKey) => {
    setActiveStrategy(nextStrategy);
    setIsCommercialOrderEditorOpen(false);
    setIsLongTermTurnaroundOrderEditorOpen(false);
    setShowAllCommercialMobileOutputs(false);
    setShowAllLongTermTurnaroundMobileOutputs(false);
    if (isMobileViewport) {
      setMobileInputView('strategy');
      setIsMobileCoreInputsMinimized(false);
      setIsMobileStrategyInputsMinimized(false);
    }
  };

  const isElementVisible = (element: HTMLElement | null) => {
    if (!element) return false;
    if (typeof window === 'undefined') return true;

    const styles = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return styles.display !== 'none' && styles.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };

  const getFirstVisibleElement = (...elements: Array<HTMLElement | null>) => {
    return elements.find((element) => isElementVisible(element)) ?? elements.find(Boolean) ?? null;
  };

  const resolveOnboardingTarget = () => {
    const step = onboardingSteps[onboardingStepIndex];
    if (!step) return null;

    if (step.id === 'vault') return dealVaultRef.current;
    if (step.id === 'signin') return authControlsRef.current;
    if (step.id === 'core') return getFirstVisibleElement(mobileCoreSectionRef.current, desktopCoreSectionRef.current);
    if (step.id === 'strategy') return getFirstVisibleElement(mobileStrategyTabsRef.current, desktopStrategyTabsRef.current);
    return irrStreamRef.current;
  };

  const completeOnboarding = () => {
    setIsOnboardingOpen(false);
    setOnboardingStepIndex(0);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    }
  };

  const goToNextOnboardingStep = () => {
    if (onboardingStepIndex >= onboardingSteps.length - 1) {
      completeOnboarding();
      return;
    }
    setOnboardingStepIndex((current) => current + 1);
  };

  const goToPreviousOnboardingStep = () => {
    setOnboardingStepIndex((current) => Math.max(current - 1, 0));
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
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('authError');
    if (!authError) return;

    setAuthFeedback({ tone: 'error', message: authError });
    setIsAuthMenuOpen(true);

    params.delete('authError');
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }, []);

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
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setPrefersReducedMotion(false);
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updateMotionPreference();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateMotionPreference);
      return () => mediaQuery.removeEventListener('change', updateMotionPreference);
    }

    mediaQuery.addListener(updateMotionPreference);
    return () => mediaQuery.removeListener(updateMotionPreference);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (typeof window.matchMedia === 'function') {
      const mediaQuery = window.matchMedia('(max-width: 767px)');
      const updateViewport = () => setIsMobileViewport(mediaQuery.matches);

      updateViewport();
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', updateViewport);
        return () => mediaQuery.removeEventListener('change', updateViewport);
      }

      mediaQuery.addListener(updateViewport);
      return () => mediaQuery.removeListener(updateViewport);
    }

    const updateViewport = () => setIsMobileViewport(window.innerWidth <= 767);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') return;
    if (typeof window === 'undefined') return;

    const hasSeenTutorial = window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1';
    if (!hasSeenTutorial) {
      setIsOnboardingOpen(true);
      setOnboardingStepIndex(0);
    }
  }, []);

  useEffect(() => {
    if (!isOnboardingOpen) return;

    const step = onboardingSteps[onboardingStepIndex];
    if (!step) return;

    if (step.id === 'core') {
      setMobileInputView('core');
      setIsMobileCoreInputsMinimized(false);
    }

    if (step.id === 'strategy') {
      setMobileInputView('strategy');
      setIsMobileCoreInputsMinimized(false);
      setIsMobileStrategyInputsMinimized(false);
    }

    if (step.id === 'signin') {
      setIsAuthMenuOpen(false);
    }

    if (step.id === 'irr') {
      const frame = window.requestAnimationFrame(() => {
        irrStreamRef.current?.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      });

      return () => window.cancelAnimationFrame(frame);
    }
  }, [isOnboardingOpen, onboardingStepIndex, prefersReducedMotion]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(COMMERCIAL_OUTPUT_ORDER_STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      setCommercialDigestOrder(normalizeCommercialDigestOrder(parsed));
    } catch {
      // Ignore malformed local preference payloads.
    }
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(LONG_TERM_TURNAROUND_OUTPUT_ORDER_STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      setLongTermTurnaroundDigestOrder(normalizeLongTermTurnaroundDigestOrder(parsed));
    } catch {
      // Ignore malformed local preference payloads.
    }
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storedDefaultStrategy = window.localStorage.getItem(SETTINGS_DEFAULT_STRATEGY_STORAGE_KEY);
    if (isStrategyKey(storedDefaultStrategy)) {
      setDefaultNewDealStrategy(storedDefaultStrategy);
    }

    const storedLightMode = window.localStorage.getItem(SETTINGS_LIGHT_MODE_STORAGE_KEY);
    if (storedLightMode === '1') {
      setIsLightMode(true);
    } else if (storedLightMode === '0') {
      setIsLightMode(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COMMERCIAL_OUTPUT_ORDER_STORAGE_KEY, JSON.stringify(normalizeCommercialDigestOrder(commercialDigestOrder)));
  }, [commercialDigestOrder]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      LONG_TERM_TURNAROUND_OUTPUT_ORDER_STORAGE_KEY,
      JSON.stringify(normalizeLongTermTurnaroundDigestOrder(longTermTurnaroundDigestOrder))
    );
  }, [longTermTurnaroundDigestOrder]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SETTINGS_DEFAULT_STRATEGY_STORAGE_KEY, defaultNewDealStrategy);
  }, [defaultNewDealStrategy]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SETTINGS_LIGHT_MODE_STORAGE_KEY, isLightMode ? '1' : '0');
  }, [isLightMode]);
  useEffect(() => {
    if (!isSettingsOpen) return;

    const closeOnOutsideClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (settingsControlsRef.current?.contains(target)) return;
      setIsSettingsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener('mousedown', closeOnOutsideClick);
    window.addEventListener('touchstart', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      window.removeEventListener('mousedown', closeOnOutsideClick);
      window.removeEventListener('touchstart', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isSettingsOpen]);

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
    setActiveStrategy(defaultNewDealStrategy);
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
      setActiveStrategy(defaultNewDealStrategy);
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
      setShareFeedback({ tone: 'error', message: 'Unable to create short share link right now.' });
      return;
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
    setAuthFeedback(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      setAuthBusy(false);
      setAuthFeedback({ tone: 'error', message: error.message ?? 'Unable to start Google sign-in. Please try again.' });
      return;
    }

    setIsAuthMenuOpen(false);
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

  const replayQuickTutorial = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    }
    setOnboardingStepIndex(0);
    setIsOnboardingOpen(true);
    setIsSettingsOpen(false);
    setIsAuthMenuOpen(false);
  };

  const resetOutputOrderingPreferences = () => {
    setCommercialDigestOrder(defaultCommercialDigestOrder);
    setLongTermTurnaroundDigestOrder(defaultLongTermTurnaroundDigestOrder);
  };

  const resetSettingsDefaults = () => {
    setDefaultNewDealStrategy(defaultNewDealStrategyFallback);
    setIsLightMode(false);
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

  const authMenuContent = (
    <>
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={authBusy || !isSupabaseConfigured}
        className="btn-primary btn-auth w-full rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-60"
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
          className="btn-primary btn-auth w-full rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-60"
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
    </>
  );

  const settingsMenuContent = (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-wide text-muted">New Deal Defaults</p>
        <label className="text-[11px] text-muted" htmlFor="settings-default-strategy">
          Default strategy
        </label>
        <select
          id="settings-default-strategy"
          value={defaultNewDealStrategy}
          onChange={(event) => {
            const nextStrategy = event.target.value;
            if (isStrategyKey(nextStrategy)) {
              setDefaultNewDealStrategy(nextStrategy);
            }
          }}
          className="settings-select w-full rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-accent/70"
        >
          {strategyKeyOrder.map((strategy) => (
            <option key={strategy} value={strategy}>
              {activeStrategyLabels[strategy]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-wide text-muted">Appearance</p>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
          <span className="text-xs text-slate-100">Theme</span>
          <button
            type="button"
            onClick={() => setIsLightMode((value) => !value)}
            className="tap-feedback rounded-md border border-white/20 bg-white/[0.04] px-2 py-1 text-[11px] font-semibold text-slate-100 hover:border-accent/60 hover:text-accent"
            aria-pressed={isLightMode}
          >
            {isLightMode ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-wide text-muted">Actions</p>
        <button
          type="button"
          onClick={replayQuickTutorial}
          className="tap-feedback w-full rounded-lg border border-white/15 bg-white/[0.03] px-2.5 py-2 text-left text-xs font-medium text-slate-100 hover:border-accent/55 hover:bg-accent/10"
        >
          Replay quick tutorial
        </button>
        <button
          type="button"
          onClick={resetOutputOrderingPreferences}
          className="tap-feedback w-full rounded-lg border border-white/15 bg-white/[0.03] px-2.5 py-2 text-left text-xs font-medium text-slate-100 hover:border-accent/55 hover:bg-accent/10"
        >
          Reset output ordering
        </button>
        <button
          type="button"
          onClick={resetSettingsDefaults}
          className="tap-feedback w-full rounded-lg border border-white/15 bg-white/[0.03] px-2.5 py-2 text-left text-xs font-medium text-slate-100 hover:border-accent/55 hover:bg-accent/10"
        >
          Reset settings defaults
        </button>
      </div>
    </div>
  );

  return (
    <main className={`app-shell-fade relative min-h-screen overflow-x-clip px-3 py-5 sm:px-4 md:px-8${isLightMode ? ' theme-light' : ''}`}>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-[340px] ${
          isLightMode
            ? 'bg-[radial-gradient(circle_at_top,rgba(245,146,58,0.18)_0%,rgba(62,132,208,0.08)_30%,transparent_72%)]'
            : 'bg-[radial-gradient(circle_at_top,rgba(244,150,58,0.28)_0%,rgba(115,150,202,0.12)_34%,transparent_72%)]'
        }`}
      />
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="panel-surface relative z-[70] rounded-2xl p-5 shadow-soft backdrop-blur">
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
              <div className="min-w-0 max-w-3xl">
                <div className="relative flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="brand-lockup" aria-label="DealCooker">
                    <h1 className="brand-text leading-none">DealCooker</h1>
                    <Image src="/icon.png" alt="" width={38} height={38} className="brand-icon" aria-hidden="true" priority />
                  </div>
                  <div ref={authControlsRef} className="w-full sm:w-auto sm:shrink-0">
                    <div className="flex w-full items-start justify-between gap-2 sm:w-auto sm:justify-start sm:gap-2.5">
                      {currentUser ? (
                        <div className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap sm:gap-2">
                          <span className="inline-flex shrink-0 items-center rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent sm:whitespace-nowrap sm:text-[11px]">
                            Cloud: Active
                          </span>
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
                            className="btn-primary btn-auth btn-auth-top tap-feedback min-h-8 rounded-full px-3 py-1 text-[11px] font-medium sm:text-xs disabled:opacity-60"
                          >
                            Sign out
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => {
                              setIsSettingsOpen(false);
                              setIsAuthMenuOpen((value) => !value);
                            }}
                            aria-expanded={isAuthMenuOpen}
                            aria-controls="auth-menu"
                            className="btn-primary btn-auth btn-auth-top tap-feedback min-h-8 rounded-full px-3 py-1 text-[11px] font-medium sm:text-xs"
                          >
                            Sign in
                          </button>
                          {isAuthMenuOpen ? (
                            <>
                              <div id="auth-menu" className="absolute right-0 top-10 z-[135] hidden w-72 rounded-xl border border-white/15 bg-surface/95 p-3 shadow-soft backdrop-blur sm:block">
                                {authMenuContent}
                              </div>
                              <div className="fixed inset-0 z-[140] bg-black/45 p-4 sm:hidden" onClick={() => setIsAuthMenuOpen(false)}>
                                <div className="mx-auto mt-16 w-full max-w-sm rounded-xl border border-white/15 bg-surface/95 p-3 shadow-soft backdrop-blur" onClick={(event) => event.stopPropagation()}>
                                  <div className="mb-2 flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => setIsAuthMenuOpen(false)}
                                      className="rounded-md border border-white/15 px-2 py-1 text-[11px] text-muted"
                                    >
                                      Close
                                    </button>
                                  </div>
                                  {authMenuContent}
                                </div>
                              </div>
                            </>
                          ) : null}
                        </div>
                      )}

                      <div ref={settingsControlsRef} className="relative">
                        <button
                          type="button"
                          aria-label="Open settings"
                          aria-expanded={isSettingsOpen}
                          aria-controls="settings-menu"
                          onClick={() => {
                            setIsAuthMenuOpen(false);
                            setIsSettingsOpen((value) => !value);
                          }}
                          className="btn-settings tap-feedback inline-flex h-8 w-8 items-center justify-center rounded-full"
                        >
                          <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                            <path d="M11.99 3.8a1 1 0 0 1 .98.8l.28 1.4c.18.06.36.14.53.22l1.22-.73a1 1 0 0 1 1.23.15l1.53 1.53a1 1 0 0 1 .15 1.22l-.73 1.22c.09.18.16.36.22.54l1.4.28a1 1 0 0 1 .8.98v2.16a1 1 0 0 1-.8.98l-1.4.28c-.06.19-.14.37-.22.54l.73 1.22a1 1 0 0 1-.15 1.22l-1.53 1.53a1 1 0 0 1-1.23.15l-1.22-.73c-.17.09-.35.16-.53.22l-.28 1.4a1 1 0 0 1-.98.8H9.83a1 1 0 0 1-.98-.8l-.28-1.4a4.88 4.88 0 0 1-.53-.22l-1.22.73a1 1 0 0 1-1.23-.15L4.06 19.6a1 1 0 0 1-.15-1.22l.73-1.22c-.08-.17-.16-.35-.22-.54l-1.4-.28a1 1 0 0 1-.8-.98V12.2a1 1 0 0 1 .8-.98l1.4-.28c.06-.19.14-.37.22-.54l-.73-1.22a1 1 0 0 1 .15-1.22L5.6 6.43a1 1 0 0 1 1.23-.15l1.22.73c.17-.08.35-.16.53-.22l.28-1.4a1 1 0 0 1 .98-.8h2.16Z" />
                            <circle cx="12" cy="13.28" r="2.7" />
                          </svg>
                        </button>

                        {isSettingsOpen ? (
                          <>
                            <div id="settings-menu" className="absolute right-0 top-10 z-[136] hidden w-80 max-w-[92vw] rounded-xl border border-white/15 bg-surface/95 p-3 shadow-soft backdrop-blur sm:block">
                              {settingsMenuContent}
                            </div>
                            <div className="fixed inset-0 z-[141] bg-black/45 p-4 sm:hidden" onClick={() => setIsSettingsOpen(false)}>
                              <div className="mx-auto mt-14 w-full max-w-sm rounded-xl border border-white/15 bg-surface/95 p-3 shadow-soft backdrop-blur" onClick={(event) => event.stopPropagation()}>
                                <div className="mb-2 flex items-center justify-between">
                                  <p className="text-sm font-semibold text-slate-100">Settings</p>
                                  <button
                                    type="button"
                                    onClick={() => setIsSettingsOpen(false)}
                                    className="rounded-md border border-white/15 px-2 py-1 text-[11px] text-muted"
                                  >
                                    Close
                                  </button>
                                </div>
                                {settingsMenuContent}
                              </div>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
                <p className="max-w-[44ch] text-sm leading-relaxed text-muted">Create addictive, pro-grade real estate strategy snapshots in seconds with instant cash flow, DSCR, ROI, and IRR intelligence.</p>
              </div>
              <div className="w-full md:min-w-0 lg:max-w-[560px]">
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
                    className="btn-primary btn-pdf inline-flex min-h-10 items-center justify-center rounded-xl px-3 py-1.5 text-xs font-medium sm:min-h-11 sm:px-4 sm:py-2 sm:text-sm"
                    target="_blank"
                  >
                    Print to PDF
                  </Link>
                  <button
                    type="button"
                    onClick={shareCurrentDeal}
                    className="btn-primary btn-link min-h-10 rounded-xl px-3 py-1.5 text-xs font-medium sm:min-h-11 sm:px-4 sm:py-2 sm:text-sm"
                  >
                    Send link
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

            {syncFeedback ? (
              <div className="fixed inset-x-3 bottom-4 z-50 rounded-lg border border-red-400/50 bg-red-500/15 px-3 py-2 text-xs text-red-100 shadow-soft sm:inset-x-auto sm:right-4 sm:text-sm" role="status">
                {syncFeedback}
              </div>
            ) : null}

            <div ref={dealVaultRef}>
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

          </div>
        </header>

        {isMobileViewport ? (
          <section className="space-y-3">
          <div ref={mobileStrategyTabsRef}>
            <StrategyTabs
              active={activeStrategy}
              onChange={handleStrategyChange}
              quickScan={{ title: activeStrategyLabel, notes: activeOutput.notes, points: quickScanPoints }}
            />
          </div>
          <div className="sticky top-2 z-30 rounded-2xl border border-white/10 bg-surface/90 p-2 backdrop-blur">
            <p className="text-xs uppercase tracking-wide text-muted">Input workspace</p>
            <div className="mt-2 grid grid-cols-2 gap-2 max-[359px]:grid-cols-1">
              <button
                type="button"
                onClick={() => {
                  setMobileInputView('core');
                  setIsMobileCoreInputsMinimized(false);
                  setIsMobileStrategyInputsMinimized(false);
                }}
                className={`tap-feedback min-h-11 rounded-xl px-3 py-2 text-sm font-medium leading-tight transition ${
                  mobileInputView === 'core' ? 'btn-primary' : 'border border-white/15 bg-white/[0.03] text-slate-200'
                }`}
              >
                Core Purchase, Financing, & Expenses
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileInputView('strategy');
                  setIsMobileCoreInputsMinimized(false);
                  setIsMobileStrategyInputsMinimized(false);
                }}
                className={`tap-feedback min-h-11 rounded-xl px-3 py-2 text-sm font-medium leading-tight transition ${
                  mobileInputView === 'strategy' ? 'btn-primary' : 'border border-white/15 bg-white/[0.03] text-slate-200'
                }`}
              >
                Strategy Inputs
              </button>
            </div>
          </div>
          <div ref={mobileCoreSectionRef} className="space-y-2">
            <p className="text-xs text-muted">
              {mobileInputView === 'core' ? 'Core Purchase, Financing, & Expenses' : `${activeStrategyLabel} Strategy Inputs`}
            </p>
            {mobileInputView === 'core' ? (
              <DealInputPanel
                value={model}
                onChange={updateModel}
                resolveListingDealName={resolveListingDealName}
                defaultAdvancedOptionsOpen={Boolean(activeDealId)}
                collapsible
                collapsed={isMobileCoreInputsMinimized}
                onToggleCollapsed={() => setIsMobileCoreInputsMinimized((prev) => !prev)}
              />
            ) : (
              <StrategyModuleInputs
                active={activeStrategy}
                model={model}
                onChange={updateModel}
                collapsible
                collapsed={isMobileStrategyInputsMinimized}
                onToggleCollapsed={() => setIsMobileStrategyInputsMinimized((prev) => !prev)}
              />
            )}
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => {
                triggerHapticFeedback('light');
                setIsStrategyWorkOpen(true);
              }}
              className="btn-primary btn-work tap-feedback min-h-12 w-full max-w-sm rounded-xl px-4 py-3 text-base font-semibold leading-tight"
            >
              Show work
            </button>
          </div>
          </section>
        ) : null}

        <section className="accent-edge isolate overflow-hidden rounded-2xl p-4 shadow-soft">
          <div key={`strategy-headline-${activeStrategy}`} className="panel-swap grid gap-3 lg:grid-cols-2 lg:items-stretch">
            <div className="relative isolate overflow-hidden rounded-xl border border-white/10 bg-[#17263a]/88 p-3 sm:p-4">
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
                    className="cashflow-ribbon-mask absolute inset-x-0 bottom-0 h-[42%] w-full"
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
                <p className="text-xs uppercase tracking-[0.16em] text-accent">{priorityMetricTitle}</p>
                <p className="mt-1 text-sm text-muted">{priorityMetricSubtitle}</p>
                <p className="absolute right-0 top-0 text-xs italic tracking-wide text-accent/90">{activeStrategyLabel}</p>
              </div>

              <div className="relative z-10 mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <p
                  className={`text-4xl font-semibold tracking-tight sm:text-6xl ${priorityMetricValue >= 0 ? 'text-emerald-300' : 'text-white'}`}
                  data-testid="kpi-priority-metric"
                  style={priorityMetricNegativeStyle}
                >
                  {currencyFormatter.format(priorityMetricValue)}
                </p>

                {supportsReserveToggle ? (
                  <div className="flex shrink-0 items-center sm:pb-1">
                    <div className="reserve-toggle-shell inline-flex rounded-lg border border-white/15 bg-black/20 p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHapticFeedback('light');
                          setIncludeReservesByStrategy((prev) => ({ ...prev, [activeStrategy]: true }));
                        }}
                        aria-pressed={includeReserves}
                        className={`reserve-toggle-btn tap-feedback rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                          includeReserves ? 'reserve-toggle-btn-active bg-white/15 text-slate-100' : 'reserve-toggle-btn-idle text-muted hover:bg-white/10'
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
                        className={`reserve-toggle-btn tap-feedback rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ${
                          !includeReserves ? 'reserve-toggle-btn-active bg-white/15 text-slate-100' : 'reserve-toggle-btn-idle text-muted hover:bg-white/10'
                        }`}
                      >
                        Exclude reserves
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {activeStrategy === 'purchase' && commercialSummary ? (
              <section className="rounded-2xl border border-white/10 bg-[#17263a]/88 p-3.5 sm:p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-accent">Commercial dashboard</p>
                    <h3 className="text-base font-semibold">Pro underwriting signals</h3>
                  </div>
                  <div className="text-right text-[11px] text-muted">
                    <p>Leased: {commercialSummary.occupiedSqft.toLocaleString()} sf</p>
                    <p>GLA: {commercialSummary.grossLeasableAreaSqft.toLocaleString()} sf</p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted">Occupancy Headroom</p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">
                      {percentFormatter.format(commercialSummary.physicalOccupancyPercent)} now vs {percentFormatter.format(commercialSummary.breakEvenOccupancyPercent)} break-even
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted">Debt Efficiency</p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">
                      Debt yield {percentFormatter.format(commercialSummary.debtYield)} on {currencyFormatter.format(commercialSummary.annualNoi)} NOI
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                    <p className="text-[11px] uppercase tracking-wide text-muted">Risk Drag</p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">
                      {currencyFormatter.format(commercialSummary.annualEconomicVacancyLoss + commercialSummary.annualCreditLoss)} annual from vacancy and credit loss
                    </p>
                  </div>
                </div>
              </section>
            ) : (
              <DealWorkoutCard model={model} strategy={activeStrategy} onApply={applyDealWorkoutScenario} />
            )}
          </div>
        </section>
        <section className="grid grid-cols-2 gap-2 max-[359px]:grid-cols-1 sm:grid-cols-2 sm:gap-3 xl:grid-cols-6">
          <KpiCard
            label="Cash to Close"
            value={currencyFormatter.format(cashToCloseValue)}
            numericValue={cashToCloseValue}
            numericValueKind="currency"
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
            numericValue={activeOutput.capRate}
            numericValueKind="percent"
            helper="Annual NOI / current property value"
            winner={activeStrategyLabel}
          />
          <KpiCard
            label="Cash on Cash"
            value={percentFormatter.format(activeOutput.cashOnCashReturn)}
            numericValue={activeOutput.cashOnCashReturn}
            numericValueKind="percent"
            helper="Annual cash flow / total cash invested"
            winner={activeStrategyLabel}
          />
          <KpiCard
            label="DSCR"
            value={activeOutput.dscr.toFixed(2)}
            numericValue={activeOutput.dscr}
            numericValueKind="ratio"
            helper="NOI / annual debt service"
            winner={activeStrategyLabel}
          />
          <KpiCard
            label="ROI"
            value={percentFormatter.format(activeOutput.roi)}
            numericValue={activeOutput.roi}
            numericValueKind="percent"
            helper="Total profit / total cash invested"
            winner={activeStrategyLabel}
          />
          <div className="min-w-0 h-full [&>div]:h-full">
            <KpiCard
              label="IRR"
              value={percentFormatter.format(activeOutput.irr)}
              numericValue={activeOutput.irr}
              numericValueKind="percent"
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
          </div>
        </section>
        {activeStrategy === 'purchase' && commercialDigestItems.length > 0 ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 shadow-soft">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Commercial outputs</p>
                <p className="hidden text-[11px] text-muted sm:block">Digest view for faster leasing and risk decisions</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCommercialOrderEditorOpen((prev) => !prev)}
                className="rounded-lg border border-white/15 bg-white/[0.02] px-2.5 py-1.5 text-[11px] font-medium text-slate-200"
              >
                {isCommercialOrderEditorOpen ? 'Done' : 'Reorder'}
              </button>
            </div>
            {isCommercialOrderEditorOpen ? (
              <div className="mb-2 space-y-1 rounded-lg border border-white/10 bg-black/20 p-2">
                {commercialDigestItems.map((item, index) => (
                  <div key={`order-${item.key}`} className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5">
                    <p className="truncate text-xs text-slate-200">
                      {index + 1}. {item.label}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Move ${item.label} up`}
                        onClick={() => moveCommercialDigestItem(index, index - 1)}
                        disabled={index === 0}
                        className="h-6 min-w-6 rounded border border-white/15 bg-black/20 px-1 text-[10px] text-slate-200 disabled:opacity-40"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${item.label} down`}
                        onClick={() => moveCommercialDigestItem(index, index + 1)}
                        disabled={index === commercialDigestItems.length - 1}
                        className="h-6 min-w-6 rounded border border-white/15 bg-black/20 px-1 text-[10px] text-slate-200 disabled:opacity-40"
                      >
                        Down
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-1.5 sm:hidden">
              {mobileCommercialDigestItems.map((item) => (
                <article key={item.key} className="min-w-0 rounded-lg border border-white/10 bg-black/25 px-2 py-1.5">
                  <p className="truncate text-[9px] uppercase tracking-wide text-muted">{item.label}</p>
                  <p
                    className="mt-0.5 truncate text-xs font-semibold leading-tight text-slate-100"
                    style={getNegativeValueStyle(item.rawValue ?? Number.NaN, { kind: item.rawKind ?? 'plain' })}
                  >
                    {item.value}
                  </p>
                </article>
              ))}
            </div>
            {hasHiddenCommercialMobileOutputs ? (
              <button
                type="button"
                onClick={() => setShowAllCommercialMobileOutputs((prev) => !prev)}
                className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.02] px-2.5 py-1.5 text-xs font-medium text-slate-200 sm:hidden"
              >
                {showAllCommercialMobileOutputs ? 'Show fewer outputs' : 'Show all outputs'}
              </button>
            ) : null}

            <div className="hidden gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-5">
              {commercialDigestItems.map((item) => (
                <article key={item.key} className="min-w-0 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
                  <p className="truncate text-[10px] uppercase tracking-wide text-muted">{item.label}</p>
                  <p
                    className="mt-1 truncate text-sm font-semibold text-slate-100"
                    style={getNegativeValueStyle(item.rawValue ?? Number.NaN, { kind: item.rawKind ?? 'plain' })}
                  >
                    {item.value}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {activeStrategy === 'longTerm' && longTermTurnaroundDigestItems.length > 0 ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 shadow-soft">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Long-term turnaround outputs</p>
                <p className="hidden text-[11px] text-muted sm:block">12-month stabilization snapshot for multifamily turnaround decisions</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">Stabilized</span>
                <button
                  type="button"
                  onClick={() => setIsLongTermTurnaroundOrderEditorOpen((prev) => !prev)}
                  className="rounded-lg border border-white/15 bg-white/[0.02] px-2.5 py-1.5 text-[11px] font-medium text-slate-200"
                >
                  {isLongTermTurnaroundOrderEditorOpen ? 'Done' : 'Reorder'}
                </button>
              </div>
            </div>
            {isLongTermTurnaroundOrderEditorOpen ? (
              <div className="mb-2 space-y-1 rounded-lg border border-white/10 bg-black/20 p-2">
                {longTermTurnaroundDigestItems.map((item, index) => (
                  <div key={`lt-order-${item.key}`} className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5">
                    <p className="truncate text-xs text-slate-200">
                      {index + 1}. {item.label}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Move ${item.label} up`}
                        onClick={() => moveLongTermTurnaroundDigestItem(index, index - 1)}
                        disabled={index === 0}
                        className="h-6 min-w-6 rounded border border-white/15 bg-black/20 px-1 text-[10px] text-slate-200 disabled:opacity-40"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${item.label} down`}
                        onClick={() => moveLongTermTurnaroundDigestItem(index, index + 1)}
                        disabled={index === longTermTurnaroundDigestItems.length - 1}
                        className="h-6 min-w-6 rounded border border-white/15 bg-black/20 px-1 text-[10px] text-slate-200 disabled:opacity-40"
                      >
                        Down
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-1.5 sm:hidden">
              {mobileLongTermTurnaroundDigestItems.map((item) => (
                <article key={item.key} className="min-w-0 rounded-lg border border-white/10 bg-black/25 px-2 py-1.5">
                  <p className="truncate text-[9px] uppercase tracking-wide text-muted">{item.label}</p>
                  <p
                    className="mt-0.5 truncate text-xs font-semibold leading-tight text-slate-100"
                    style={getNegativeValueStyle(item.rawValue ?? Number.NaN, { kind: item.rawKind ?? 'plain' })}
                  >
                    {item.value}
                  </p>
                </article>
              ))}
            </div>
            {hasHiddenLongTermTurnaroundMobileOutputs ? (
              <button
                type="button"
                onClick={() => setShowAllLongTermTurnaroundMobileOutputs((prev) => !prev)}
                className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.02] px-2.5 py-1.5 text-xs font-medium text-slate-200 sm:hidden"
              >
                {showAllLongTermTurnaroundMobileOutputs ? 'Show fewer outputs' : 'Show all outputs'}
              </button>
            ) : null}
            <div className="hidden gap-2 sm:grid sm:grid-cols-3 lg:grid-cols-4">
              {longTermTurnaroundDigestItems.map((item) => (
                <article key={item.key} className="min-w-0 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
                  <p className="truncate text-[10px] uppercase tracking-wide text-muted">{item.label}</p>
                  <p
                    className="mt-1 truncate text-sm font-semibold text-slate-100"
                    style={getNegativeValueStyle(item.rawValue ?? Number.NaN, { kind: item.rawKind ?? 'plain' })}
                  >
                    {item.value}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <div className="grid gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            {!isMobileViewport ? (
              <div ref={desktopStrategyTabsRef}>
                <StrategyTabs
                  active={activeStrategy}
                  onChange={handleStrategyChange}
                  quickScan={{ title: activeStrategyLabel, notes: activeOutput.notes, points: quickScanPoints }}
                  actionSlot={
                    <button
                      type="button"
                      onClick={() => {
                        triggerHapticFeedback('light');
                        setIsStrategyWorkOpen(true);
                      }}
                      className="btn-primary btn-work tap-feedback rounded-xl px-3 py-2 text-sm font-medium"
                    >
                      Show work
                    </button>
                  }
                />
              </div>
            ) : null}
            {!isMobileViewport ? (
              <section className="grid gap-3">
                <StrategyModuleInputs active={activeStrategy} model={model} onChange={updateModel} />
              </section>
            ) : null}
            <div ref={irrStreamRef}>
              <TimelineCard
                output={result[activeStrategy]}
                assumptions={model.assumptions}
                defaultOpen={Boolean(activeDealId)}
                onAssumptionsChange={(updates) =>
                  updateModel((current) => ({ ...current, assumptions: { ...current.assumptions, ...updates } }))
                }
              />
            </div>
            <StrategyComparison data={result} />
          </div>

          {!isMobileViewport ? (
            <div ref={desktopCoreSectionRef}>
              <DealInputPanel value={model} onChange={updateModel} resolveListingDealName={resolveListingDealName} defaultAdvancedOptionsOpen={Boolean(activeDealId)} />
            </div>
          ) : null}
        </div>
      </div>
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

      <OnboardingTour
        open={isOnboardingOpen}
        steps={onboardingSteps}
        stepIndex={onboardingStepIndex}
        getTargetElement={resolveOnboardingTarget}
        onBack={goToPreviousOnboardingStep}
        onNext={goToNextOnboardingStep}
        onSkip={completeOnboarding}
      />

      <StrategyWorkLightbox
        open={isStrategyWorkOpen}
        activeStrategy={activeStrategy}
        output={activeOutput}
        onClose={() => setIsStrategyWorkOpen(false)}
      />
    </main>
  );
}



