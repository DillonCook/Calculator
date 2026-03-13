'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { User } from '@supabase/supabase-js';
import { AssumptionsPanel } from '@/components/dashboard/assumptions-panel';
import { DealInputPanel } from '@/components/dashboard/deal-input-panel';
import { DealWorkoutCard } from '@/components/dashboard/deal-workout-card';
import { DealsVaultPanel } from '@/components/dashboard/scenario-corner';
import { StrategyComparison } from '@/components/dashboard/strategy-comparison';
import { StrategyModuleInputs } from '@/components/dashboard/strategy-module-inputs';
import { MobileSheet } from '@/components/dashboard/mobile-sheet';
import { OnboardingTour, type OnboardingStep } from '@/components/dashboard/onboarding-tour';
import { StrategyTabs } from '@/components/dashboard/strategy-tabs';
import { StrategyWorkLightbox } from '@/components/dashboard/strategy-work-lightbox';
import { TimelineCard } from '@/components/dashboard/timeline-card';
import { PwaInstallBanner, PWA_OPEN_INSTALL_EVENT, PWA_QUALIFY_INSTALL_EVENT } from '@/components/dashboard/pwa-install-banner';
import { inputClass } from '@/components/dashboard/form-fields';
import { KpiCard } from '@/components/ui/kpi-card';
import { createDealInVault, readDealsFromVault, removeDealFromVault, saveDealToVault } from '@/lib/deals-vault-service';
import { calculateDeal } from '@/lib/engine/deal-engine';
import { calculateCashToClose } from '@/lib/engine/finance';
import { type DealWorkoutScenario } from '@/lib/engine/deal-workout';
import {
  defaultDealInput,
  isStrategyKey,
  normalizeProjectionStrategySelection,
  strategyKeyOrder,
  type DealInputModel,
  type MasterAssumptions,
  type ScenarioRecord,
  type StrategyKey
} from '@/lib/models/deal';
import { createScenarioRecord, encodeScenario, writeScenarios } from '@/lib/scenario-storage';
import { deleteSupabaseScenario, fetchSupabaseScenarios, upsertSupabaseScenario } from '@/lib/cloud-scenarios-sync';
import { decodeDealFromShareParam, encodeDealToShareParam } from '@/lib/share-link';
import { createShortShareLink } from '@/lib/share-links';

import { currencyFormatter, percentFormatter } from '@/lib/formatters';
import { getNegativeValueStyle, type NegativeValueKind } from '@/lib/negative-value-color';
import { triggerHapticFeedback } from '@/lib/use-haptics';
import { extractDealNameFromListingUrl, isOneHomeUrl, normalizeListingUrl } from '@/lib/listing-link';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';


const activeStrategyLabels: Record<StrategyKey, string> = {
  purchase: 'Commercial',
  longTerm: 'Long-Term',
  airbnb: 'Airbnb',
  padSplit: 'PadSplit',
  brrrr: 'BRRRR',
  flip: 'Flip'
};

type CompactMode = 'inputs' | 'results' | 'compare';
type CompactInputSection = 'core' | 'expenses' | 'strategy' | 'irr';
type CompactSheetView = 'menu' | 'deals' | 'strategy' | 'metrics' | 'timeline' | null;
type HeadlineMetricId = 'cashToClose' | 'capRate' | 'cashOnCash' | 'dscr' | 'roi' | 'irr';

const compactModeLabels: Record<CompactMode, string> = {
  inputs: 'Inputs',
  results: 'Results',
  compare: 'Projections'
};
const headlineMetricOptions: Array<{ id: HeadlineMetricId; label: string }> = [
  { id: 'cashToClose', label: 'Cash to Close' },
  { id: 'capRate', label: 'Cap Rate' },
  { id: 'cashOnCash', label: 'Cash on Cash' },
  { id: 'dscr', label: 'DSCR' },
  { id: 'roi', label: 'ROI' },
  { id: 'irr', label: 'IRR' }
];
const defaultHeadlineMetricOrder: HeadlineMetricId[] = ['cashToClose', 'capRate', 'cashOnCash', 'dscr', 'roi', 'irr'];
const KPI_ORDER_STORAGE_KEY = 'dealcooker-kpi-order:v1';
const headlineMetricKeySet = new Set<HeadlineMetricId>(headlineMetricOptions.map((option) => option.id));
const compactDealDateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const compactStrategyDescriptions: Record<StrategyKey, string> = {
  purchase: 'Commercial rent-roll underwriting',
  longTerm: 'Traditional rental hold',
  airbnb: 'Nightly stay income',
  padSplit: 'Room-by-room cash flow',
  brrrr: 'Refi and recycle capital',
  flip: 'Renovate and exit'
};

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
  | 'stab-cf'
  | 'stab-cf-no-reserves'
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
const SETTINGS_DEFAULT_PROJECTION_STRATEGIES_STORAGE_KEY = 'dealcooker-default-projection-strategies:v1';
const SETTINGS_LIGHT_MODE_STORAGE_KEY = 'dealcooker-light-mode:v1';
const SETTINGS_QUICK_SCAN_VISIBLE_STORAGE_KEY = 'dealcooker-show-quick-scan:v1';
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
  'stab-cf',
  'stab-cf-no-reserves',
  'stab-cap-rate',
  'stab-coc',
  'stab-dscr',
  'stab-irr',
  'stab-implied-value',
  'stab-equity-created'
];
const valuationPercentDigestKeys = new Set<string>(['stab-cap-rate', 'stab-coc', 'stab-irr']);
const commercialDigestKeySet = new Set<CommercialDigestKey>(defaultCommercialDigestOrder);
const longTermTurnaroundDigestKeySet = new Set<LongTermTurnaroundDigestKey>(defaultLongTermTurnaroundDigestOrder);
const normalizeHeadlineMetricOrder = (value: unknown): HeadlineMetricId[] => {
  const normalized: HeadlineMetricId[] = [];
  const input = Array.isArray(value) ? value : [];

  for (const rawKey of input) {
    if (typeof rawKey !== 'string') continue;
    const key = rawKey as HeadlineMetricId;
    if (!headlineMetricKeySet.has(key)) continue;
    if (normalized.includes(key)) continue;
    normalized.push(key);
  }

  for (const fallbackKey of defaultHeadlineMetricOrder) {
    if (!normalized.includes(fallbackKey)) normalized.push(fallbackKey);
  }

  return normalized;
};

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
const COMPACT_RECENT_DEALS_LIMIT = 10;
const desktopOnboardingSteps: OnboardingStep[] = [
  {
    id: 'vault',
    title: 'Your Deals Stay Here',
    body: 'If you want to come back to a deal later, this is where you save it, rename it, and reopen it without starting over.'
  },
  {
    id: 'signin',
    title: 'Sign In to Pick Up Where You Left Off',
    body: 'Use Sign in in the top-right if you want your saved deals on multiple devices. It also makes sharing a deal easier.'
  },
  {
    id: 'core',
    title: 'Start With the Purchase Basics',
    body: 'Begin here with the price, rehab budget, financing, and cash needed to close. This gives the calculator the core details it needs first.'
  },
  {
    id: 'expenses',
    title: 'Add the Ongoing Costs',
    body: 'Next, enter taxes, insurance, HOA or PMI, and other operating costs so the monthly numbers reflect the real carrying expenses.'
  },
  {
    id: 'strategy',
    title: 'Adjust the Strategy You Want to Test',
    body: 'After you pick a strategy, update the numbers that are specific to that plan. This is where rent, nightly rate, refinance timing, or flip assumptions change.'
  },
  {
    id: 'irr',
    title: 'Set Your Hold and Exit Assumptions',
    body: 'Use this section to decide how long you plan to hold the property and what happens when you exit. These choices shape the projected returns over time.'
  }
];
const mobileOnboardingSteps: OnboardingStep[] = [
  {
    id: 'mobileDeals',
    title: 'Your Saved Deals Are Here',
    body: 'Tap Recent deals when you want to reopen something you already worked on. It is also where you can duplicate or remove older deal scenarios.'
  },
  {
    id: 'mobileStrategy',
    title: 'Pick the Strategy First',
    body: 'Tap this strategy button to choose the kind of deal you want to analyze. You can switch between Commercial, Long-Term, Airbnb, PadSplit, BRRRR, and Flip at any time.'
  },
  {
    id: 'mobileCore',
    title: 'Tap Core to Enter the Basics',
    body: 'Start with Core when you are entering the purchase price, rehab budget, financing, and cash needed to buy the property.'
  },
  {
    id: 'mobileExpenses',
    title: 'Tap Expenses for Monthly Costs',
    body: 'Open Expenses when you are ready to add taxes, insurance, HOA or PMI, and other operating costs so the deal reflects the real monthly burden.'
  },
  {
    id: 'mobileStrategyInputs',
    title: 'Tap Strategy for Plan-Specific Numbers',
    body: 'Use Strategy after you choose your approach. That section holds the numbers that change based on the plan, like rent, nightly rate, refinance details, or flip assumptions.'
  },
  {
    id: 'mobileIrr',
    title: 'Tap IRR for Hold and Exit Settings',
    body: 'Open IRR when you want to set how long you will keep the property and how you expect to exit. Those choices affect the return timeline.'
  },
  {
    id: 'mobileResults',
    title: 'Results Shows the Deal Outcome',
    body: 'Once you have entered enough information, tap Results to see the main numbers for the deal. This is where you check cash flow, returns, and the overall verdict.'
  },
  {
    id: 'mobileCompare',
    title: 'Use Projections to Model the Future',
    body: 'Tap Projections to see how cash flow, equity, and returns could build over time. You can still view multiple strategies side by side, but this screen is mainly for projecting where each plan may lead.'
  },
  {
    id: 'mobileActions',
    title: 'More Actions Live Here',
    body: 'Use this menu for sharing, printing, signing in, installing the app, and changing settings. It keeps the main screen simple while the extra tools stay one tap away.'
  }
];




const cloneDefaultDealPayload = (): DealInputModel => ({
  ...defaultDealInput,
  purchase: { ...defaultDealInput.purchase },
  commercial: { ...defaultDealInput.commercial },
  longTerm: {
    ...defaultDealInput.longTerm,
    turnaround: { ...defaultDealInput.longTerm.turnaround }
  },
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

const buildNewDealPayload = (dealName: string, listingUrl = ''): DealInputModel => {
  const base = cloneDefaultDealPayload();

  return {
    ...base,
    purchase: {
      ...base.purchase,
      dealName,
      listingUrl,
      purchasePrice: 0,
      rehabBudget: 0,
      arv: 0
    },
    commercial: {
      ...base.commercial,
      averageBaseRentPerSqftYear: 0,
      nnnRecoveryPerSqftYear: 0
    },
    longTerm: {
      ...base.longTerm,
      grossRentMonthly: 0,
      turnaround: {
        ...base.longTerm.turnaround,
        stabilizedGrossRentMonthly: 0
      }
    },
    airbnb: {
      ...base.airbnb,
      adr: 0
    },
    padSplit: {
      ...base.padSplit,
      avgWeeklyRatePerRoom: 0
    }
  };
};
const defaultNewDealStrategyFallback: StrategyKey = 'longTerm';
const defaultProjectionStrategySelectionFallback: StrategyKey[] = [...strategyKeyOrder];
const areStrategySelectionsEqual = (left: StrategyKey[], right: StrategyKey[]) =>
  left.length === right.length && left.every((strategy, index) => strategy === right[index]);

export default function HomePage() {
  const [initialVaultState] = useState(() => {
    const storedDeals = readDealsFromVault();
    const nextDeals =
      storedDeals.length > 0
        ? storedDeals
        : (() => {
            const payload = buildNewDealPayload('New Deal');
            const freshDeal = createDealInVault(payload, payload.purchase.dealName);
            return saveDealToVault(freshDeal);
          })();

    return {
      deals: nextDeals,
      activeDeal: nextDeals[0] ?? null
    };
  });
  const initialActiveDealUiState = initialVaultState.activeDeal?.payload.uiState;
  const hasInitialDealActiveStrategy = Boolean(initialActiveDealUiState?.activeStrategy);
  const hasInitialDealProjectionStrategies = Array.isArray(initialActiveDealUiState?.projectionStrategies) && initialActiveDealUiState.projectionStrategies.length > 0;
  const [model, setModel] = useState(initialVaultState.activeDeal?.payload ?? defaultDealInput);
  const [activeStrategy, setActiveStrategy] = useState<StrategyKey>(
    isStrategyKey(initialActiveDealUiState?.activeStrategy) ? initialActiveDealUiState.activeStrategy : defaultNewDealStrategyFallback
  );
  const [deals, setDeals] = useState<ScenarioRecord[]>(initialVaultState.deals);
  const [activeDealId, setActiveDealId] = useState(initialVaultState.activeDeal?.scenarioId ?? '');
  const [defaultNewDealStrategy, setDefaultNewDealStrategy] = useState<StrategyKey>(defaultNewDealStrategyFallback);
  const [defaultProjectionStrategies, setDefaultProjectionStrategies] = useState<StrategyKey[]>(defaultProjectionStrategySelectionFallback);
  const [isLightMode, setIsLightMode] = useState(false);
  const [isQuickScanVisible, setIsQuickScanVisible] = useState(true);
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
  const [compactMode, setCompactMode] = useState<CompactMode>('inputs');
  const [compactSheetView, setCompactSheetView] = useState<CompactSheetView>(null);
  const [compactInputSection, setCompactInputSection] = useState<CompactInputSection>('core');
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [showAllCommercialMobileOutputs, setShowAllCommercialMobileOutputs] = useState(false);
  const [showAllLongTermTurnaroundMobileOutputs, setShowAllLongTermTurnaroundMobileOutputs] = useState(false);
  const [compactSelectedStrategies, setCompactSelectedStrategies] = useState<StrategyKey[]>(
    hasInitialDealProjectionStrategies
      ? normalizeProjectionStrategySelection(initialActiveDealUiState?.projectionStrategies)
      : defaultProjectionStrategySelectionFallback
  );
  const [compactDealsSearch, setCompactDealsSearch] = useState('');
  const [headlineMetricOrder, setHeadlineMetricOrder] = useState<HeadlineMetricId[]>(defaultHeadlineMetricOrder);
  const [isHeadlineMetricOrderEditorOpen, setIsHeadlineMetricOrderEditorOpen] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isDealIdentityOpen, setIsDealIdentityOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [isAuthMenuOpen, setIsAuthMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);
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
  const desktopAuthActionRef = useRef<HTMLDivElement | null>(null);
  const settingsControlsRef = useRef<HTMLDivElement | null>(null);
  const desktopSettingsControlsRef = useRef<HTMLDivElement | null>(null);
  const compactInputsViewRef = useRef<HTMLDivElement | null>(null);
  const mobileCoreSectionRef = useRef<HTMLDivElement | null>(null);
  const mobileExpensesSectionRef = useRef<HTMLDivElement | null>(null);
  const mobileStrategyInputsRef = useRef<HTMLDivElement | null>(null);
  const mobileIrrSectionRef = useRef<HTMLDivElement | null>(null);
  const desktopCoreSectionRef = useRef<HTMLDivElement | null>(null);
  const desktopStrategyTabsRef = useRef<HTMLDivElement | null>(null);
  const desktopStrategyInputsRef = useRef<HTMLDivElement | null>(null);
  const desktopIrrInputsRef = useRef<HTMLDivElement | null>(null);
  const mobileStrategyTabsRef = useRef<HTMLDivElement | null>(null);
  const irrStreamRef = useRef<HTMLDivElement | null>(null);
  const compactDealsButtonRef = useRef<HTMLButtonElement | null>(null);
  const compactStrategyButtonRef = useRef<HTMLButtonElement | null>(null);
  const compactCoreInputButtonRef = useRef<HTMLButtonElement | null>(null);
  const compactExpensesInputButtonRef = useRef<HTMLButtonElement | null>(null);
  const compactStrategyInputButtonRef = useRef<HTMLButtonElement | null>(null);
  const compactIrrInputButtonRef = useRef<HTMLButtonElement | null>(null);
  const compactResultsNavButtonRef = useRef<HTMLButtonElement | null>(null);
  const compactCompareNavButtonRef = useRef<HTMLButtonElement | null>(null);
  const compactMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const compactTimelineButtonRef = useRef<HTMLButtonElement | null>(null);

  const resolveDealUiState = useCallback(
    (payload: DealInputModel) => ({
      activeStrategy: isStrategyKey(payload.uiState?.activeStrategy) ? payload.uiState.activeStrategy : defaultNewDealStrategy,
      projectionStrategies: payload.uiState?.projectionStrategies
        ? normalizeProjectionStrategySelection(payload.uiState.projectionStrategies)
        : normalizeProjectionStrategySelection(defaultProjectionStrategies)
    }),
    [defaultNewDealStrategy, defaultProjectionStrategies]
  );

  const attachDealUiState = useCallback(
    (
      payload: DealInputModel,
      overrides?: {
        activeStrategy?: StrategyKey;
        projectionStrategies?: StrategyKey[];
      }
    ): DealInputModel => ({
      ...payload,
      uiState: {
        activeStrategy: overrides?.activeStrategy ?? activeStrategy,
        projectionStrategies: normalizeProjectionStrategySelection(overrides?.projectionStrategies ?? compactSelectedStrategies)
      }
    }),
    [activeStrategy, compactSelectedStrategies]
  );

  const result = useMemo(() => calculateDeal(model), [model]);
  const exportPayload = useMemo(() => encodeScenario(createScenarioRecord(attachDealUiState(model))), [attachDealUiState, model]);
  const printToPdfUrl = useMemo(() => `/print?scenario=${exportPayload}&strategy=${activeStrategy}`, [activeStrategy, exportPayload]);

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
  const shouldColorDigestMetric = (item: DigestItem<string>) => {
    if (item.rawKind === 'currency') return true;
    if (item.rawKind === 'ratio') return true;
    if (item.rawKind === 'percent') return valuationPercentDigestKeys.has(item.key);
    return false;
  };
  const getDigestMetricStyle = (item: DigestItem<string>) => {
    if (!shouldColorDigestMetric(item)) return undefined;
    const rawKind = item.rawKind ?? 'plain';
    return getNegativeValueStyle(item.rawValue ?? Number.NaN, { kind: rawKind, baseline: rawKind === 'ratio' ? 1 : 0 });
  };
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
  const compactReadiness = useMemo(() => {
    const missing: string[] = [];
    const hasDealName = model.purchase.dealName.trim().length > 0;
    if (!hasDealName) missing.push('deal name');

    if (model.purchase.ownershipMode === 'purchase') {
      if (model.purchase.purchasePrice <= 0) missing.push('purchase price');
      if (model.purchase.financingType === 'loan' && model.purchase.downPaymentPercent <= 0) missing.push('down payment');
      if (model.purchase.financingType === 'loan' && model.purchase.interestRate <= 0) missing.push('interest rate');
    }

    if (activeStrategy === 'purchase') {
      if (model.commercial.grossLeasableAreaSqft <= 0) missing.push('gross leasable area');
      if (model.commercial.occupiedSqft <= 0) missing.push('leased area');
      if (model.commercial.averageBaseRentPerSqftYear <= 0) missing.push('base rent');
    }

    if (activeStrategy === 'longTerm' && model.longTerm.grossRentMonthly <= 0) {
      missing.push('gross rent');
    }

    if (activeStrategy === 'airbnb' && model.airbnb.adr <= 0) {
      missing.push('ADR');
    }

    if (activeStrategy === 'padSplit') {
      if (model.padSplit.rentableRooms <= 0) missing.push('rentable rooms');
      if (model.padSplit.avgWeeklyRatePerRoom <= 0) missing.push('weekly rate');
    }

    if ((activeStrategy === 'brrrr' || activeStrategy === 'flip') && (model.purchase.arv <= 0) && !result[activeStrategy].saleProceeds) {
      missing.push('ARV');
    }

    return {
      ready: missing.length === 0,
      missing
    };
  }, [activeStrategy, model, result]);
  const currentOnboardingSteps = isMobileViewport ? mobileOnboardingSteps : desktopOnboardingSteps;
  const onboardingHighlightedCoreSection =
    isOnboardingOpen && !isMobileViewport
      ? currentOnboardingSteps[onboardingStepIndex]?.id === 'expenses'
        ? 'expenses'
        : currentOnboardingSteps[onboardingStepIndex]?.id === 'core'
          ? 'purchaseFinancing'
          : undefined
      : undefined;
  const compactSortedDeals = useMemo(
    () => [...deals].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [deals]
  );
  const recentCompactDeals = useMemo(() => compactSortedDeals.slice(0, COMPACT_RECENT_DEALS_LIMIT), [compactSortedDeals]);
  const normalizedCompactDealsSearch = compactDealsSearch.trim().toLowerCase();
  const filteredCompactSortedDeals = useMemo(() => {
    if (!normalizedCompactDealsSearch) return compactSortedDeals;
    return compactSortedDeals.filter((deal) => deal.dealName.toLowerCase().includes(normalizedCompactDealsSearch));
  }, [compactSortedDeals, normalizedCompactDealsSearch]);
  const displayedCompactDeals = normalizedCompactDealsSearch ? filteredCompactSortedDeals : recentCompactDeals;
  const compactProjectionStrategies = useMemo(
    () => normalizeProjectionStrategySelection(compactSelectedStrategies),
    [compactSelectedStrategies]
  );
  const compactCompareSelection = compactProjectionStrategies;
  const headlineMetricCards = useMemo(() => {
    const cards: Record<HeadlineMetricId, ReactNode> = {
      cashToClose: (
        <KpiCard
          label="Cash to Close"
          value={currencyFormatter.format(cashToCloseValue)}
          winner={activeStrategyLabels[activeStrategy]}
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
      ),
      capRate: (
        <KpiCard
          label="Cap Rate"
          value={percentFormatter.format(activeOutput.capRate)}
          numericValue={activeOutput.capRate}
          numericValueKind="percent"
          helper="Annual NOI / current property value"
          winner={activeStrategyLabels[activeStrategy]}
        />
      ),
      cashOnCash: (
        <KpiCard
          label="Cash on Cash"
          value={percentFormatter.format(activeOutput.cashOnCashReturn)}
          numericValue={activeOutput.cashOnCashReturn}
          numericValueKind="percent"
          helper="Annual cash flow / total cash invested"
          winner={activeStrategyLabels[activeStrategy]}
        />
      ),
      dscr: (
        <KpiCard
          label="DSCR"
          value={activeOutput.dscr.toFixed(2)}
          numericValue={activeOutput.dscr}
          numericValueKind="ratio"
          numericValueBaseline={1}
          helper="NOI / annual debt service"
          winner={activeStrategyLabels[activeStrategy]}
        />
      ),
      roi: (
        <KpiCard
          label="ROI"
          value={percentFormatter.format(activeOutput.roi)}
          numericValue={activeOutput.roi}
          numericValueKind="percent"
          helper="Total profit / total cash invested"
          winner={activeStrategyLabels[activeStrategy]}
        />
      ),
      irr: (
        <KpiCard
          label="IRR"
          value={percentFormatter.format(activeOutput.irr)}
          numericValue={activeOutput.irr}
          numericValueKind="percent"
          helper="Discounted return from yearly cashflow timeline"
          winner={activeStrategyLabels[activeStrategy]}
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
      )
    };

    return cards;
  }, [activeOutput, activeStrategy, cashToCloseValue]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const rawValue = window.localStorage.getItem(KPI_ORDER_STORAGE_KEY);
    if (!rawValue) return;

    try {
      const parsedValue = JSON.parse(rawValue);
      setHeadlineMetricOrder(normalizeHeadlineMetricOrder(parsedValue));
    } catch {
      // Ignore malformed stored KPI preferences.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(KPI_ORDER_STORAGE_KEY, JSON.stringify(normalizeHeadlineMetricOrder(headlineMetricOrder)));
  }, [headlineMetricOrder]);

  useEffect(() => {
    setCompactSelectedStrategies((current) => normalizeProjectionStrategySelection(current));
  }, []);

  useEffect(() => {
    if (!isMobileViewport) return;
    if (compactReadiness.ready || compactMode === 'inputs') return;
    setCompactMode('inputs');
  }, [compactMode, compactReadiness.ready, isMobileViewport]);
  const activeStrategyLabel = activeStrategyLabels[activeStrategy];
  const compactInputSections = [
    {
      key: 'core' as const,
      label: 'Core',
      summary:
        model.purchase.ownershipMode === 'owned'
          ? 'Owned carry'
          : model.purchase.financingType === 'loan'
            ? 'Loan baseline'
            : 'Cash baseline'
    },
    {
      key: 'expenses' as const,
      label: 'Expenses',
      summary: 'Taxes + ops'
    },
    {
      key: 'strategy' as const,
      label: 'Strategy',
      summary: activeStrategyLabel
    },
    {
      key: 'irr' as const,
      label: 'IRR',
      summary: `${model.assumptions.holdYears}y hold`
    }
  ];
  const activeDealDisplayName = model.purchase.dealName || 'New Deal';
  const quickScanPoints = quickScanDetails[activeStrategy];
  const strategyQuickScan = isQuickScanVisible ? { title: activeStrategyLabel, notes: activeOutput.notes, points: quickScanPoints } : undefined;
  const orderedHeadlineMetricIds = normalizeHeadlineMetricOrder(headlineMetricOrder);
  const showTargetIrrInput =
    model.purchase.financingType === 'cash' &&
    ['purchase', 'longTerm', 'airbnb', 'padSplit', 'brrrr'].includes(activeStrategy);
  const hasMoreMetricsContent =
    Boolean(strategyQuickScan) ||
    (activeStrategy === 'purchase' && commercialDigestItems.length > 0) ||
    (activeStrategy === 'longTerm' && longTermTurnaroundDigestItems.length > 0);
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

  const renderProfileAvatar = () => (
    <div className="h-8 w-8 overflow-hidden rounded-full border border-white/20 bg-white/10" aria-label="Profile photo">
      {profileImageUrl ? (
        <img src={profileImageUrl} alt="Signed-in user profile photo" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-100">{profileFallbackLabel}</div>
      )}
    </div>
  );

  const moveCommercialDigestItem = (fromIndex: number, toIndex: number) => {
    setCommercialDigestOrder((current) => {
      const next = [...normalizeCommercialDigestOrder(current)];
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= next.length || toIndex >= next.length) return next;

      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };
  const moveHeadlineMetricItem = (fromIndex: number, toIndex: number) => {
    setHeadlineMetricOrder((current) => {
      const next = [...normalizeHeadlineMetricOrder(current)];
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
    const nextUiState = resolveDealUiState(payload);
    setModel({
      ...payload,
      uiState: {
        activeStrategy: nextUiState.activeStrategy,
        projectionStrategies: nextUiState.projectionStrategies
      }
    });
    setActiveStrategy(nextUiState.activeStrategy);
    setCompactSelectedStrategies(nextUiState.projectionStrategies);
    if (dealId) setActiveDealId(dealId);
  };

  const updateModel: Dispatch<SetStateAction<DealInputModel>> = (nextModel) => {
    if (activeDealId) setSaveStatus('saving');
    setModel(nextModel);
  };

  const updateAssumptions = (updates: Partial<MasterAssumptions>) => {
    updateModel((current) => ({ ...current, assumptions: { ...current.assumptions, ...updates } }));
  };

  const toggleCompactProjectionStrategy = (strategy: StrategyKey) => {
    triggerHapticFeedback('light');
    setCompactSelectedStrategies((current) => {
      const normalizedCurrent = normalizeProjectionStrategySelection(current);
      const isSelected = normalizedCurrent.includes(strategy);
      if (isSelected && normalizedCurrent.length === 1) {
        return normalizedCurrent;
      }

      const next = isSelected
        ? normalizedCurrent.filter((entry) => entry !== strategy)
        : [...normalizedCurrent, strategy];

      return strategyKeyOrder.filter((entry) => next.includes(entry));
    });
  };

  const toggleDefaultProjectionStrategy = (strategy: StrategyKey) => {
    triggerHapticFeedback('light');
    setDefaultProjectionStrategies((current) => {
      const normalizedCurrent = normalizeProjectionStrategySelection(current);
      const isSelected = normalizedCurrent.includes(strategy);
      if (isSelected && normalizedCurrent.length === 1) {
        return normalizedCurrent;
      }

      const next = isSelected
        ? normalizedCurrent.filter((entry) => entry !== strategy)
        : [...normalizedCurrent, strategy];

      return strategyKeyOrder.filter((entry) => next.includes(entry));
    });
  };

  const handleStrategyChange = (nextStrategy: StrategyKey) => {
    setActiveStrategy(nextStrategy);
    setIsHeadlineMetricOrderEditorOpen(false);
    setIsCommercialOrderEditorOpen(false);
    setIsLongTermTurnaroundOrderEditorOpen(false);
    setShowAllCommercialMobileOutputs(false);
    setShowAllLongTermTurnaroundMobileOutputs(false);
    if (isMobileViewport) {
      setCompactMode('inputs');
      setCompactSheetView(null);
      setCompactInputSection('strategy');
    }
  };

  useEffect(() => {
    const nextProjectionStrategies = normalizeProjectionStrategySelection(compactSelectedStrategies);
    const currentProjectionStrategies = normalizeProjectionStrategySelection(model.uiState?.projectionStrategies);

    if (model.uiState?.activeStrategy === activeStrategy && areStrategySelectionsEqual(currentProjectionStrategies, nextProjectionStrategies)) {
      return;
    }

    if (activeDealId) setSaveStatus('saving');
    setModel((current) => ({
      ...current,
      uiState: {
        activeStrategy,
        projectionStrategies: nextProjectionStrategies
      }
    }));
  }, [activeDealId, activeStrategy, compactSelectedStrategies, model.uiState]);

  const selectCompactInputSection = (section: CompactInputSection) => {
    if (compactInputSection === section) return;

    const controlsTop = typeof window === 'undefined' ? null : mobileStrategyTabsRef.current?.getBoundingClientRect().top ?? null;

    triggerHapticFeedback('light');
    setCompactInputSection(section);

    if (typeof window === 'undefined' || controlsTop === null) return;

    window.requestAnimationFrame(() => {
      const nextControlsTop = mobileStrategyTabsRef.current?.getBoundingClientRect().top;
      if (typeof nextControlsTop !== 'number') return;

      const delta = nextControlsTop - controlsTop;
      if (Math.abs(delta) < 1) return;

      window.scrollBy({
        top: delta,
        behavior: 'auto'
      });
    });
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
    const step = currentOnboardingSteps[onboardingStepIndex];
    if (!step) return null;

    if (step.id === 'mobileDeals') return compactDealsButtonRef.current;
    if (step.id === 'mobileStrategy') return compactStrategyButtonRef.current;
    if (step.id === 'mobileCore') return compactCoreInputButtonRef.current;
    if (step.id === 'mobileExpenses') return compactExpensesInputButtonRef.current;
    if (step.id === 'mobileStrategyInputs') return compactStrategyInputButtonRef.current;
    if (step.id === 'mobileIrr') return compactIrrInputButtonRef.current;
    if (step.id === 'mobileResults') return compactResultsNavButtonRef.current;
    if (step.id === 'mobileCompare') return compactCompareNavButtonRef.current;
    if (step.id === 'mobileActions') return compactMenuButtonRef.current;
    if (step.id === 'vault') return getFirstVisibleElement(compactMenuButtonRef.current, dealVaultRef.current);
    if (step.id === 'signin') return getFirstVisibleElement(compactMenuButtonRef.current, desktopAuthActionRef.current, authControlsRef.current);
    if (step.id === 'core') return desktopCoreSectionRef.current;
    if (step.id === 'expenses') return desktopCoreSectionRef.current;
    if (step.id === 'strategy') return desktopStrategyInputsRef.current;
    if (step.id === 'irr') return desktopIrrInputsRef.current;
    return getFirstVisibleElement(compactTimelineButtonRef.current, irrStreamRef.current);
  };

  const scrollMobileTutorialControlsIntoView = useCallback(() => {
    const frame = window.requestAnimationFrame(() => {
      mobileStrategyTabsRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
        inline: 'nearest'
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [prefersReducedMotion]);

  const scrollMobileActionsButtonIntoView = useCallback(() => {
    const frame = window.requestAnimationFrame(() => {
      compactMenuButtonRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'nearest'
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [prefersReducedMotion]);

  const completeOnboarding = () => {
    setIsOnboardingOpen(false);
    setOnboardingStepIndex(0);
    setCompactSheetView(null);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    }
  };

  const goToNextOnboardingStep = () => {
    if (onboardingStepIndex >= currentOnboardingSteps.length - 1) {
      completeOnboarding();
      return;
    }
    setOnboardingStepIndex((current) => current + 1);
  };

  const goToPreviousOnboardingStep = () => {
    setOnboardingStepIndex((current) => Math.max(current - 1, 0));
  };

  function reportSupabaseError(error: unknown, operation: 'fetch' | 'upsert' | 'delete') {
    const details =
      error && typeof error === 'object'
        ? { status: (error as { status?: unknown }).status, message: (error as { message?: unknown }).message }
        : { status: undefined, message: String(error) };

    console.error(`Supabase scenarios ${operation} error:`, { details, error });
    setLastCloudError(operation);
    setCloudHealth('error');
    setSyncFeedback('Cloud sync error while saving Deal Vault.');
  }

  async function syncScenarioUpsert(scenario: ScenarioRecord) {
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
  }

  async function syncScenarioDelete(scenarioId: string) {
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
  }

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
      const mediaQuery = window.matchMedia('(max-width: 1023px)');
      const updateViewport = () => setIsMobileViewport(mediaQuery.matches);

      updateViewport();
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', updateViewport);
        return () => mediaQuery.removeEventListener('change', updateViewport);
      }

      mediaQuery.addListener(updateViewport);
      return () => mediaQuery.removeListener(updateViewport);
    }

    const updateViewport = () => setIsMobileViewport(window.innerWidth <= 1023);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
    const displayModeQuery = window.matchMedia('(display-mode: standalone)');
    const updateInstallState = () =>
      setIsPwaInstalled(displayModeQuery.matches || navigatorWithStandalone.standalone === true);
    const markInstalled = () => setIsPwaInstalled(true);

    updateInstallState();
    if (typeof displayModeQuery.addEventListener === 'function') {
      displayModeQuery.addEventListener('change', updateInstallState);
    } else {
      displayModeQuery.addListener(updateInstallState);
    }

    window.addEventListener('appinstalled', markInstalled);
    return () => {
      if (typeof displayModeQuery.removeEventListener === 'function') {
        displayModeQuery.removeEventListener('change', updateInstallState);
      } else {
        displayModeQuery.removeListener(updateInstallState);
      }
      window.removeEventListener('appinstalled', markInstalled);
    };
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

    const step = currentOnboardingSteps[onboardingStepIndex];
    if (!step) return;

    if (step.id === 'mobileDeals') {
      setCompactMode('inputs');
      setCompactSheetView(null);
    }

    if (step.id === 'mobileStrategy') {
      setCompactMode('inputs');
      setCompactSheetView(null);
      setCompactInputSection('strategy');
      return scrollMobileTutorialControlsIntoView();
    }

    if (step.id === 'mobileCore') {
      setCompactMode('inputs');
      setCompactSheetView(null);
      setCompactInputSection('core');
      return scrollMobileTutorialControlsIntoView();
    }

    if (step.id === 'mobileExpenses') {
      setCompactMode('inputs');
      setCompactSheetView(null);
      setCompactInputSection('expenses');
      return scrollMobileTutorialControlsIntoView();
    }

    if (step.id === 'mobileStrategyInputs') {
      setCompactMode('inputs');
      setCompactSheetView(null);
      setCompactInputSection('strategy');
      return scrollMobileTutorialControlsIntoView();
    }

    if (step.id === 'mobileIrr') {
      setCompactMode('inputs');
      setCompactSheetView(null);
      setCompactInputSection('irr');
      return scrollMobileTutorialControlsIntoView();
    }

    if (step.id === 'mobileResults') {
      setCompactSheetView(null);
    }

    if (step.id === 'mobileCompare') {
      setCompactSheetView(null);
    }

    if (step.id === 'mobileActions') {
      setCompactSheetView(null);
      return scrollMobileActionsButtonIntoView();
    }

    if (step.id === 'core') {
      setCompactMode('inputs');
      setCompactInputSection('core');
    }

    if (step.id === 'expenses') {
      setCompactMode('inputs');
      setCompactInputSection('expenses');
    }

    if (step.id === 'strategy') {
      setCompactMode('inputs');
      setCompactInputSection('strategy');
    }

    if (step.id === 'signin') {
      setIsAuthMenuOpen(false);
      if (isMobileViewport) setCompactSheetView('menu');
    }

    if (step.id === 'irr') {
      setCompactMode('inputs');
      setCompactInputSection('irr');

      const frame = window.requestAnimationFrame(() => {
        desktopIrrInputsRef.current?.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      });

      return () => window.cancelAnimationFrame(frame);
    }
  }, [currentOnboardingSteps, isMobileViewport, isOnboardingOpen, onboardingStepIndex, prefersReducedMotion, scrollMobileActionsButtonIntoView, scrollMobileTutorialControlsIntoView]);

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
      if (!hasInitialDealActiveStrategy) {
        setActiveStrategy(storedDefaultStrategy);
      }
    }

    const storedDefaultProjectionStrategies = window.localStorage.getItem(SETTINGS_DEFAULT_PROJECTION_STRATEGIES_STORAGE_KEY);
    if (storedDefaultProjectionStrategies) {
      try {
        const parsedProjectionStrategies = JSON.parse(storedDefaultProjectionStrategies);
        const normalizedProjectionStrategies = normalizeProjectionStrategySelection(parsedProjectionStrategies);
        setDefaultProjectionStrategies(normalizedProjectionStrategies);
        if (!hasInitialDealProjectionStrategies) {
          setCompactSelectedStrategies(normalizedProjectionStrategies);
        }
      } catch {
        // Ignore malformed projection strategy preferences.
      }
    }

    const storedLightMode = window.localStorage.getItem(SETTINGS_LIGHT_MODE_STORAGE_KEY);
    if (storedLightMode === '1') {
      setIsLightMode(true);
    } else if (storedLightMode === '0') {
      setIsLightMode(false);
    }

    const storedQuickScanVisible = window.localStorage.getItem(SETTINGS_QUICK_SCAN_VISIBLE_STORAGE_KEY);
    if (storedQuickScanVisible === '0') {
      setIsQuickScanVisible(false);
    } else if (storedQuickScanVisible === '1') {
      setIsQuickScanVisible(true);
    }
  }, [hasInitialDealActiveStrategy, hasInitialDealProjectionStrategies]);

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
    window.localStorage.setItem(
      SETTINGS_DEFAULT_PROJECTION_STRATEGIES_STORAGE_KEY,
      JSON.stringify(normalizeProjectionStrategySelection(defaultProjectionStrategies))
    );
  }, [defaultProjectionStrategies]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SETTINGS_LIGHT_MODE_STORAGE_KEY, isLightMode ? '1' : '0');
  }, [isLightMode]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SETTINGS_QUICK_SCAN_VISIBLE_STORAGE_KEY, isQuickScanVisible ? '1' : '0');
  }, [isQuickScanVisible]);
  useEffect(() => {
    if (!isSettingsOpen) return;

    const closeOnOutsideClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (settingsControlsRef.current?.contains(target)) return;
      if (desktopSettingsControlsRef.current?.contains(target)) return;
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

  const qualifyInstallPrompt = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event(PWA_QUALIFY_INSTALL_EVENT));
  };

  const buildUniqueDealName = (requestedDealName: string, ignoredScenarioId?: string) => {
    const baseName = requestedDealName.trim() || 'New Deal';
    const normalizedNames = new Set(
      deals
        .filter((deal) => deal.scenarioId !== ignoredScenarioId)
        .map((deal) => deal.dealName.toLowerCase())
    );

    if (!normalizedNames.has(baseName.toLowerCase())) {
      return baseName;
    }

    let suffix = 2;
    let candidateName = `${baseName} ${suffix}`;

    while (normalizedNames.has(candidateName.toLowerCase())) {
      suffix += 1;
      candidateName = `${baseName} ${suffix}`;
    }

    return candidateName;
  };

  const saveDealAs = (dealName: string, listingUrl: string) => {
    const nextPayload: DealInputModel = {
      ...attachDealUiState(model),
      purchase: {
        ...model.purchase,
        dealName,
        listingUrl
      }
    };
    const record = createDealInVault(nextPayload, dealName);
    const next = saveDealToVault(record);
    setDeals(next);
    loadScenario(record.payload, record.scenarioId);
    queueScenarioPush(record);
    setSaveStatus('saved');
    qualifyInstallPrompt();
  };

  const renameDeal = (dealName: string) => {
    if (!activeDeal) return;
    const payload = {
      ...attachDealUiState(model),
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
    qualifyInstallPrompt();
  };

  const createNewDeal = (requestedDealName: string, listingUrl: string, options?: { openIdentityEditor?: boolean }) => {
    const candidateName = buildUniqueDealName(requestedDealName);
    const nextProjectionStrategies = normalizeProjectionStrategySelection(defaultProjectionStrategies);
    const payload = attachDealUiState(buildNewDealPayload(candidateName, listingUrl.trim()), {
      activeStrategy: defaultNewDealStrategy,
      projectionStrategies: nextProjectionStrategies
    });

    const nextDeal = createDealInVault(payload, candidateName);
    const next = saveDealToVault(nextDeal);
    setDeals(next);
    loadScenario(nextDeal.payload, nextDeal.scenarioId);
    queueScenarioPush(nextDeal);
    setSaveStatus('saved');
    qualifyInstallPrompt();
    if (options?.openIdentityEditor) {
      setIsDealIdentityOpen(true);
    }
  };

  const duplicateScenario = (scenarioId: string) => {
    const scenario = deals.find((entry) => entry.scenarioId === scenarioId);
    if (!scenario) return;

    const nextDealName = buildUniqueDealName(`${scenario.dealName} Copy`);
    const duplicatedPayload: DealInputModel = {
      ...scenario.payload,
      purchase: {
        ...scenario.payload.purchase,
        dealName: nextDealName
      }
    };

    const duplicatedDeal = createDealInVault(duplicatedPayload, nextDealName);
    const nextDeals = saveDealToVault(duplicatedDeal);
    setDeals(nextDeals);
    loadScenario(duplicatedDeal.payload, duplicatedDeal.scenarioId);
    queueScenarioPush(duplicatedDeal);
    setSaveStatus('saved');
    qualifyInstallPrompt();
  };

  const handleDealNameChange = (dealName: string) => {
    updateModel((current) => ({
      ...current,
      purchase: {
        ...current.purchase,
        dealName
      }
    }));
  };

  const handleListingUrlChange = (listingUrlInput: string) => {
    const listingUrl = listingUrlInput.trim();
    updateModel((current) => {
      const extractedDealName = extractDealNameFromListingUrl(listingUrl);
      const shouldRename = !isOneHomeUrl(listingUrl) && Boolean(extractedDealName);

      return {
        ...current,
        purchase: {
          ...current.purchase,
          listingUrl,
          dealName: shouldRename ? extractedDealName ?? current.purchase.dealName : current.purchase.dealName
        }
      };
    });
  };

  const openDealIdentityEditor = () => {
    triggerHapticFeedback('light');
    setCompactSheetView(null);
    setIsAuthMenuOpen(false);
    setIsSettingsOpen(false);
    setIsDealIdentityOpen(true);
  };

  const openRecentScenario = (scenarioId: string) => {
    const scenario = deals.find((entry) => entry.scenarioId === scenarioId);
    if (!scenario) return;
    loadScenario(scenario.payload, scenario.scenarioId);
  };

  const removeScenarioById = (scenarioId: string) => {
    if (!deals.some((deal) => deal.scenarioId === scenarioId)) return;

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
      const nextProjectionStrategies = normalizeProjectionStrategySelection(defaultProjectionStrategies);
      const nextDeal = createDealInVault(
        attachDealUiState(payload, {
          activeStrategy: defaultNewDealStrategy,
          projectionStrategies: nextProjectionStrategies
        }),
        payload.purchase.dealName
      );
      const nextDeals = saveDealToVault(nextDeal);
      setDeals(nextDeals);
      loadScenario(nextDeal.payload, nextDeal.scenarioId);
      queueScenarioPush(nextDeal);
      setSaveStatus('saved');
      qualifyInstallPrompt();
    } else {
      setDeals(next);
      if (activeDealId === scenarioId) {
        const nextActiveDeal = next[0];
        if (nextActiveDeal) {
          loadScenario(nextActiveDeal.payload, nextActiveDeal.scenarioId);
        } else {
          setActiveDealId('');
        }
      }
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

  const removeScenario = () => {
    if (!activeDeal) return;
    removeScenarioById(activeDeal.scenarioId);
  };

  const resolveListingDealName = useCallback(async () => null, []);

  const shareCurrentDeal = async () => {
    if (currentUser?.id) {
      const { slug, error } = await createShortShareLink({
        ownerId: currentUser.id,
        scenarioId: activeDealId || undefined,
        payloadSnapshot: attachDealUiState(model)
      });

      if (!error && slug) {
        const shortUrl = `${window.location.origin}/s/${slug}`;
        try {
          await navigator.clipboard.writeText(shortUrl);
          triggerHapticFeedback('success');
          setShareFeedback({ tone: 'success', message: 'Copied share link.' });
          qualifyInstallPrompt();
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

    const encoded = encodeDealToShareParam(attachDealUiState(model));
    if (!encoded) {
      setShareFeedback({ tone: 'error', message: 'Unable to generate a share link for this deal.' });
      return;
    }

    const url = `${window.location.origin}${window.location.pathname}?s=${encoded}`;

    try {
      await navigator.clipboard.writeText(url);
      triggerHapticFeedback('success');
      setShareFeedback({ tone: 'success', message: 'Share link copied to clipboard.' });
      qualifyInstallPrompt();
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
    setCompactSheetView(null);
    setIsSettingsOpen(false);
    setIsAuthMenuOpen(false);
  };

  const resetOutputOrderingPreferences = () => {
    setCommercialDigestOrder(defaultCommercialDigestOrder);
    setLongTermTurnaroundDigestOrder(defaultLongTermTurnaroundDigestOrder);
  };

  const resetSettingsDefaults = () => {
    setDefaultNewDealStrategy(defaultNewDealStrategyFallback);
    setDefaultProjectionStrategies(defaultProjectionStrategySelectionFallback);
    setIsLightMode(false);
    setIsQuickScanVisible(true);
  };

  const openInstallPromptFromSettings = () => {
    if (typeof window === 'undefined') return;
    triggerHapticFeedback('light');
    setIsSettingsOpen(false);
    window.dispatchEvent(new Event(PWA_OPEN_INSTALL_EVENT));
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
      if (nextActiveDeal) {
        loadScenario(nextActiveDeal.payload, nextActiveDeal.scenarioId);
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
      loadScenario(imported.payload, imported.scenarioId);
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
        <div className="space-y-2 pt-1">
          <p className="text-[11px] text-muted">Default projections strategies</p>
          <div className="grid grid-cols-2 gap-2">
            {strategyKeyOrder.map((strategy) => {
              const isSelected = defaultProjectionStrategies.includes(strategy);

              return (
                <button
                  key={`settings-default-projection-${strategy}`}
                  type="button"
                  onClick={() => toggleDefaultProjectionStrategy(strategy)}
                  aria-pressed={isSelected}
                  className={`tap-feedback rounded-lg border px-2.5 py-2 text-left text-[11px] font-medium transition ${
                    isSelected
                      ? 'border-accent/55 bg-accent/12 text-accent'
                      : 'border-white/10 bg-white/[0.03] text-slate-100 hover:border-white/20'
                  }`}
                >
                  {activeStrategyLabels[strategy]}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted">These chips appear in Projections for each new deal.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-wide text-muted">Appearance</p>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
          <span className="text-xs text-slate-100">Theme</span>
          <button
            type="button"
            onClick={() => {
              triggerHapticFeedback('light');
              setIsLightMode((value) => !value);
            }}
            className="tap-feedback rounded-md border border-white/20 bg-white/[0.04] px-2 py-1 text-[11px] font-semibold text-slate-100 hover:border-accent/60 hover:text-accent"
            aria-pressed={isLightMode}
          >
            {isLightMode ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
          <span className="text-xs text-slate-100">Quick scan</span>
          <button
            type="button"
            onClick={() => {
              triggerHapticFeedback('light');
              setIsQuickScanVisible((value) => !value);
            }}
            className="tap-feedback rounded-md border border-white/20 bg-white/[0.04] px-2 py-1 text-[11px] font-semibold text-slate-100 hover:border-accent/60 hover:text-accent"
            aria-pressed={isQuickScanVisible}
          >
            {isQuickScanVisible ? 'Shown' : 'Hidden'}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-wide text-muted">Actions</p>
        <button
          type="button"
          onClick={() => {
            triggerHapticFeedback('light');
            replayQuickTutorial();
          }}
          className="tap-feedback w-full rounded-lg border border-white/15 bg-white/[0.03] px-2.5 py-2 text-left text-xs font-medium text-slate-100 hover:border-accent/55 hover:bg-accent/10"
        >
          Replay quick tutorial
        </button>
        <button
          type="button"
          onClick={() => {
            triggerHapticFeedback('light');
            resetOutputOrderingPreferences();
          }}
          className="tap-feedback w-full rounded-lg border border-white/15 bg-white/[0.03] px-2.5 py-2 text-left text-xs font-medium text-slate-100 hover:border-accent/55 hover:bg-accent/10"
        >
          Reset output ordering
        </button>
        {!isPwaInstalled ? (
          <button
            type="button"
            onClick={openInstallPromptFromSettings}
            className="tap-feedback w-full rounded-lg border border-white/15 bg-white/[0.03] px-2.5 py-2 text-left text-xs font-medium text-slate-100 hover:border-accent/55 hover:bg-accent/10"
          >
            Download the app!
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            triggerHapticFeedback('medium');
            resetSettingsDefaults();
          }}
          className="tap-feedback w-full rounded-lg border border-white/15 bg-white/[0.03] px-2.5 py-2 text-left text-xs font-medium text-slate-100 hover:border-accent/55 hover:bg-accent/10"
        >
          Reset settings defaults
        </button>
      </div>
    </div>
  );

  const dealIdentitySheet = (
    <MobileSheet open={isDealIdentityOpen} title="Deal identity" onClose={() => setIsDealIdentityOpen(false)}>
      <div className="mobile-sheet-stack space-y-4">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted">Header editor</p>
            <h3 className="mt-1 text-base font-semibold text-slate-100">Deal name and listing link</h3>
            <p className="mt-1 text-sm text-muted">Changes save to the active deal as you type.</p>
          </div>

          <div className="grid gap-3">
            <label className="space-y-1">
              <span className="text-[11px] text-muted">Deal name</span>
              <input
                className={inputClass}
                value={model.purchase.dealName}
                onChange={(event) => handleDealNameChange(event.target.value)}
                placeholder="Deal title"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-muted">Listing URL</span>
              <input
                aria-label="Listing URL (Zillow, Redfin, etc.)"
                className={inputClass}
                value={model.purchase.listingUrl}
                onChange={(event) => handleListingUrlChange(event.target.value)}
                placeholder="Listing URL (optional)"
              />
            </label>
          </div>

          {model.purchase.listingUrl ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                className="tap-feedback inline-flex min-h-9 items-center rounded-lg border border-accent/40 bg-accent/12 px-3 py-1.5 text-xs font-medium text-accent hover:border-accent/65 hover:bg-accent/20"
                href={normalizeListingUrl(model.purchase.listingUrl)}
                target="_blank"
                rel="noreferrer"
              >
                View listing link
              </a>
            </div>
          ) : null}
        </section>
      </div>
    </MobileSheet>
  );

  const compactInputsView = (
    <div ref={compactInputsViewRef} className="scroll-mt-28 space-y-4">
      <div
        ref={mobileCoreSectionRef}
        id="compact-input-panel-core"
        role="tabpanel"
        aria-labelledby="compact-input-tab-core"
        hidden={compactInputSection !== 'core'}
        className={compactInputSection === 'core' ? 'panel-swap' : 'hidden'}
      >
        <DealInputPanel
          value={model}
          onChange={updateModel}
          resolveListingDealName={resolveListingDealName}
          defaultAdvancedOptionsOpen={false}
          forcedCoreSection="purchaseFinancing"
        />
      </div>

      <div
        ref={mobileExpensesSectionRef}
        id="compact-input-panel-expenses"
        role="tabpanel"
        aria-labelledby="compact-input-tab-expenses"
        hidden={compactInputSection !== 'expenses'}
        className={compactInputSection === 'expenses' ? 'panel-swap' : 'hidden'}
      >
        <DealInputPanel
          value={model}
          onChange={updateModel}
          resolveListingDealName={resolveListingDealName}
          defaultAdvancedOptionsOpen={false}
          forcedCoreSection="expenses"
        />
      </div>

      <div
        ref={mobileStrategyInputsRef}
        id="compact-input-panel-strategy"
        role="tabpanel"
        aria-labelledby="compact-input-tab-strategy"
        hidden={compactInputSection !== 'strategy'}
        className={compactInputSection === 'strategy' ? 'panel-swap' : 'hidden'}
      >
        <StrategyModuleInputs active={activeStrategy} model={model} onChange={updateModel} />
      </div>

      <div
        ref={mobileIrrSectionRef}
        id="compact-input-panel-irr"
        role="tabpanel"
        aria-labelledby="compact-input-tab-irr"
        hidden={compactInputSection !== 'irr'}
        className={compactInputSection === 'irr' ? 'panel-swap' : 'hidden'}
      >
        <AssumptionsPanel assumptions={model.assumptions} onChange={updateAssumptions} showTargetIrrInput={showTargetIrrInput} />
      </div>
    </div>
  );

  const headlineMetricSection = (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 shadow-soft">
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setIsHeadlineMetricOrderEditorOpen((prev) => !prev)}
          className="rounded-lg border border-white/15 bg-white/[0.02] px-2.5 py-1.5 text-[11px] font-medium text-slate-200"
        >
          {isHeadlineMetricOrderEditorOpen ? 'Done' : 'Reorder'}
        </button>
      </div>

      {isHeadlineMetricOrderEditorOpen ? (
        <div className="mb-3 space-y-1 rounded-lg border border-white/10 bg-black/20 p-2">
          {orderedHeadlineMetricIds.map((metricId, index) => {
            const metricLabel = headlineMetricOptions.find((option) => option.id === metricId)?.label ?? metricId;

            return (
              <div key={`kpi-order-${metricId}`} className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5">
                <p className="truncate text-xs text-slate-200">
                  {index + 1}. {metricLabel}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${metricLabel} up`}
                    onClick={() => moveHeadlineMetricItem(index, index - 1)}
                    disabled={index === 0}
                    className="h-6 min-w-6 rounded border border-white/15 bg-black/20 px-1 text-[10px] text-slate-200 disabled:opacity-40"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${metricLabel} down`}
                    onClick={() => moveHeadlineMetricItem(index, index + 1)}
                    disabled={index === orderedHeadlineMetricIds.length - 1}
                    className="h-6 min-w-6 rounded border border-white/15 bg-black/20 px-1 text-[10px] text-slate-200 disabled:opacity-40"
                  >
                    Down
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 max-[359px]:grid-cols-1 sm:grid-cols-2 sm:gap-3 xl:grid-cols-6">
        {orderedHeadlineMetricIds.map((metricId) => (
          <div key={`headline-metric-${metricId}`} className="min-w-0 h-full [&>div]:h-full">
            {headlineMetricCards[metricId]}
          </div>
        ))}
      </div>
    </section>
  );

  const compactResultsView = (
    <>
      <section className="accent-edge isolate overflow-hidden rounded-2xl p-4 shadow-soft">
        <div key={`strategy-headline-mobile-${activeStrategy}`} className="panel-swap space-y-4">
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
                  key={`cashflow-ribbon-compact-${activeStrategy}-${cashFlowBarsAnimationKey}`}
                  viewBox="0 0 100 40"
                  className="cashflow-ribbon-mask absolute inset-x-0 bottom-0 h-[42%] w-full"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="cashflowBarPosGradCompact" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5CCBFF" stopOpacity="0.56" />
                      <stop offset="100%" stopColor="#1E4778" stopOpacity="0.08" />
                    </linearGradient>
                    <linearGradient id="cashflowBarNegGradCompact" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF9A55" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#5B2B16" stopOpacity="0.09" />
                    </linearGradient>
                  </defs>
                  {monthlyCashFlowBarData.map((bar, index) => (
                    <rect
                      key={`${bar.key}-compact-${cashFlowBarsAnimationKey}`}
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={bar.height}
                      rx={bar.width / 2}
                      fill={bar.isNegative ? 'url(#cashflowBarNegGradCompact)' : 'url(#cashflowBarPosGradCompact)'}
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

            <div className="relative z-10 pr-16">
              <p className="text-xs uppercase tracking-[0.16em] text-accent">{priorityMetricTitle}</p>
              <p className="mt-1 text-sm text-muted">{priorityMetricSubtitle}</p>
              <p className="absolute right-0 top-0 whitespace-nowrap text-xs italic tracking-wide text-accent/90">{activeStrategyLabel}</p>
            </div>

            <div className="relative z-10 mt-3 flex flex-col gap-3">
              <p
                className={`text-4xl font-semibold tracking-tight ${priorityMetricValue >= 0 ? 'text-emerald-300' : 'text-white'}`}
                data-testid="kpi-priority-metric"
                style={priorityMetricNegativeStyle}
              >
                {currencyFormatter.format(priorityMetricValue)}
              </p>

              {supportsReserveToggle ? (
                <div className="flex shrink-0 items-center">
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
        </div>
      </section>

      {headlineMetricSection}

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
        <DealWorkoutCard
          model={model}
          strategy={activeStrategy}
          targetIrrPercent={model.assumptions.targetIrrPercent}
          onApply={applyDealWorkoutScenario}
        />
      )}

    </>
  );

  const compactCompareView = (
    <>
      <section aria-label="Projections strategy selection" className="mobile-stagger-item panel-surface rounded-2xl p-4 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-accent">Projections</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-100">Choose strategies</h2>
          </div>
          <span className="rounded-full border border-white/15 bg-black/20 px-2.5 py-1 text-[11px] text-slate-200">
            {compactCompareSelection.length} selected
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {strategyKeyOrder.map((strategy, index) => {
            const isSelected = compactCompareSelection.includes(strategy);
            return (
              <button
                key={`projection-selector-${strategy}`}
                type="button"
                onClick={() => toggleCompactProjectionStrategy(strategy)}
                aria-pressed={isSelected}
                className={`tap-feedback mobile-stagger-item rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                  isSelected ? 'accent-edge' : 'border-white/10 bg-white/[0.03] text-slate-200'
                }`}
                style={{ animationDelay: `${80 + index * 36}ms` }}
              >
                <span className="font-medium">{activeStrategyLabels[strategy]}</span>
              </button>
            );
          })}
        </div>
      </section>

      <StrategyComparison
        data={result}
        input={model}
        holdYears={model.assumptions.holdYears}
        visibleStrategies={compactCompareSelection}
        inlineModelingViews
        lockBoardOpen
      />
    </>
  );

  const compactSheets = (
    <>
      <MobileSheet open={compactSheetView === 'deals'} title="Deals" onClose={() => setCompactSheetView(null)}>
        <div className="mobile-sheet-stack space-y-4">
          <section className="flex h-[min(62dvh,540px)] flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-muted">Recent deals</p>
                <p className="mt-1 text-sm text-slate-100">Open, duplicate, or delete saved scenarios without leaving the mobile workflow.</p>
              </div>
              <span className="rounded-full border border-white/15 bg-black/20 px-2.5 py-1 text-[11px] text-slate-200">
                {deals.length} total
              </span>
            </div>

            <label className="sr-only" htmlFor="compact-deal-search">
              Search deal name
            </label>
            <input
              id="compact-deal-search"
              className={`${inputClass} mt-3 bg-white/[0.03]`}
              placeholder="Search deal name"
              value={compactDealsSearch}
              onChange={(event) => setCompactDealsSearch(event.target.value)}
            />
            <p className="mt-2 text-xs text-muted">Showing your latest {COMPACT_RECENT_DEALS_LIMIT} deals. Search to find anything older.</p>

            {displayedCompactDeals.length > 0 ? (
              <div className="scrollbar-premium mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="space-y-2">
                  {displayedCompactDeals.map((deal) => (
                    <article
                      key={`compact-recent-${deal.scenarioId}`}
                      className={`rounded-xl border p-3 ${
                        deal.scenarioId === activeDealId ? 'accent-edge' : 'border-white/10 bg-black/20'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          triggerHapticFeedback('light');
                          openRecentScenario(deal.scenarioId);
                          setCompactSheetView(null);
                        }}
                        className="tap-feedback w-full text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="line-clamp-1 text-sm font-medium text-slate-100">{deal.dealName}</p>
                          <span className="shrink-0 text-[11px] text-muted">
                            {compactDealDateFormatter.format(new Date(deal.updatedAt))}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {deal.scenarioId === activeDealId ? 'Current active deal' : 'Tap to open'}
                        </p>
                      </button>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            triggerHapticFeedback('light');
                            duplicateScenario(deal.scenarioId);
                          }}
                          className="tap-feedback rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm font-medium text-slate-100"
                          aria-label={`Duplicate ${deal.dealName}`}
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            triggerHapticFeedback('medium');
                            removeScenarioById(deal.scenarioId);
                          }}
                          className="tap-feedback rounded-lg border border-red-500/45 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-100"
                          aria-label={`Delete ${deal.dealName}`}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-3 flex min-h-0 flex-1 items-center">
                <p className="w-full rounded-xl border border-dashed border-white/15 bg-black/20 px-3 py-2 text-sm text-muted">
                  {compactDealsSearch.trim()
                    ? 'No deals match this search.'
                    : 'No saved deals yet. Start with a blank one and it will appear here.'}
                </p>
              </div>
            )}
          </section>
        </div>
      </MobileSheet>

      <MobileSheet open={compactSheetView === 'strategy'} title="Choose strategy" onClose={() => setCompactSheetView(null)}>
        <div className="mobile-sheet-stack space-y-3">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted">Active strategy</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">{activeStrategyLabel}</h3>
                <p className="mt-1 text-sm text-muted">{compactStrategyDescriptions[activeStrategy]}</p>
              </div>
              <span
                className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] ${
                  compactReadiness.ready
                    ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100'
                    : 'border-white/15 bg-black/20 text-slate-200'
                }`}
              >
                {compactReadiness.ready ? 'Unlocked' : 'Needs inputs'}
              </span>
            </div>
          </section>

          <div className="space-y-2">
            {strategyKeyOrder.map((strategy) => (
              <button
                key={`compact-strategy-sheet-${strategy}`}
                type="button"
                onClick={() => {
                  triggerHapticFeedback('light');
                  handleStrategyChange(strategy);
                  setCompactSheetView(null);
                }}
                className={`tap-feedback flex w-full items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                  activeStrategy === strategy ? 'accent-edge' : 'border-white/10 bg-white/[0.03] text-slate-200'
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-100">{activeStrategyLabels[strategy]}</p>
                  <p className="mt-1 text-xs text-muted">{compactStrategyDescriptions[strategy]}</p>
                </div>
                <span className="shrink-0 text-xs text-muted">{activeStrategy === strategy ? 'Selected' : 'Switch'}</span>
              </button>
            ))}
          </div>
        </div>
      </MobileSheet>

      <MobileSheet open={compactSheetView === 'menu'} title="Settings" onClose={() => setCompactSheetView(null)}>
        <div className="mobile-sheet-stack space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={shareCurrentDeal} className="btn-primary rounded-xl px-4 py-3 text-sm font-semibold">
              Send link
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHapticFeedback('light');
                window.open(printToPdfUrl, '_blank', 'noopener,noreferrer');
              }}
              className="tap-feedback rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-sm font-medium text-slate-100"
            >
              Print to PDF
            </button>
            {model.purchase.listingUrl ? (
              <button
                type="button"
                onClick={() => {
                  triggerHapticFeedback('light');
                  window.open(normalizeListingUrl(model.purchase.listingUrl), '_blank', 'noopener,noreferrer');
                }}
                className="tap-feedback rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-sm font-medium text-slate-100"
              >
                View listing
              </button>
            ) : null}
          </div>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-muted">Authentication</p>
                <p className="mt-1 text-sm text-slate-100">{currentUser ? 'Cloud sync is active on this device.' : 'Sign in to sync scenarios across devices.'}</p>
              </div>
              {currentUser ? renderProfileAvatar() : null}
            </div>
            {currentUser ? (
              <button
                type="button"
                onClick={signOut}
                disabled={authBusy || !isSupabaseConfigured}
                className="btn-primary btn-auth w-full rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-60"
              >
                Sign out
              </button>
            ) : (
              authMenuContent
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="mb-3 text-xs uppercase tracking-[0.16em] text-muted">Settings</p>
            {settingsMenuContent}
          </section>
        </div>
      </MobileSheet>

      <MobileSheet open={compactSheetView === 'metrics'} title="More metrics" onClose={() => setCompactSheetView(null)}>
        <div className="mobile-sheet-stack space-y-4">
          {!hasMoreMetricsContent ? (
            <section className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-3">
              <p className="text-sm text-muted">No additional scenario-specific metrics are available for this strategy right now.</p>
            </section>
          ) : null}

          {strategyQuickScan ? (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted">Quick scan</p>
              <h3 className="mt-1 text-base font-semibold text-slate-100">{strategyQuickScan.title}</h3>
              <p className="mt-1 text-sm text-muted">{strategyQuickScan.notes}</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-200">
                {strategyQuickScan.points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {activeStrategy === 'purchase' && commercialDigestItems.length > 0 ? (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted">Commercial outputs</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {commercialDigestItems.map((item) => (
                  <article key={`compact-metric-${item.key}`} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted">{item.label}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-100" style={getDigestMetricStyle(item)}>
                      {item.value}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {activeStrategy === 'longTerm' && longTermTurnaroundDigestItems.length > 0 ? (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted">Long-term turnaround outputs</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {longTermTurnaroundDigestItems.map((item) => (
                  <article key={`compact-lt-metric-${item.key}`} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted">{item.label}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-100" style={getDigestMetricStyle(item)}>
                      {item.value}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </MobileSheet>

      <MobileSheet open={compactSheetView === 'timeline'} title="Timeline" onClose={() => setCompactSheetView(null)}>
        <div className="mobile-stagger-item">
          <TimelineCard output={result[activeStrategy]} assumptions={model.assumptions} collapsible={false} summaryVariant="compact" />
        </div>
      </MobileSheet>
    </>
  );

  const compactShell = (
    <>
      <section ref={mobileStrategyTabsRef} className="sticky top-2 z-30 space-y-2 rounded-2xl border border-white/10 bg-surface/90 p-2 backdrop-blur">
        <button
          ref={compactStrategyButtonRef}
          type="button"
          onClick={() => {
            triggerHapticFeedback('light');
            setCompactSheetView('strategy');
          }}
          className="tap-feedback flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left"
          aria-label="Choose strategy"
        >
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Strategy</p>
            <p className="mt-1 whitespace-nowrap text-base font-semibold text-slate-100">{activeStrategyLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-white/15 bg-black/20 px-2 py-1 text-[11px] text-muted sm:inline-flex">
              Change
            </span>
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </button>

        {compactMode === 'results' ? (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                triggerHapticFeedback('light');
                setCompactSheetView('metrics');
              }}
              disabled={!hasMoreMetricsContent}
              className="tap-feedback rounded-xl border border-white/15 bg-white/[0.03] px-3 py-3 text-sm font-medium text-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              More metrics
            </button>
            <button
              ref={compactTimelineButtonRef}
              type="button"
              onClick={() => {
                triggerHapticFeedback('light');
                setCompactSheetView('timeline');
              }}
              className="tap-feedback rounded-xl border border-white/15 bg-white/[0.03] px-3 py-3 text-sm font-medium text-slate-100"
            >
              Timeline
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHapticFeedback('light');
                setIsStrategyWorkOpen(true);
              }}
              className="btn-primary btn-work tap-feedback rounded-xl px-3 py-3 text-sm font-semibold"
            >
              Show work
            </button>
          </div>
        ) : null}

        {compactMode === 'inputs' ? (
          <div role="tablist" aria-label="Input section selection" className="grid grid-cols-4 gap-2 max-[359px]:grid-cols-2">
            {compactInputSections.map((section) => {
              const isActive = compactInputSection === section.key;

              return (
                <button
                  key={`compact-input-tab-${section.key}`}
                  ref={
                    section.key === 'core'
                      ? compactCoreInputButtonRef
                      : section.key === 'expenses'
                        ? compactExpensesInputButtonRef
                        : section.key === 'strategy'
                          ? compactStrategyInputButtonRef
                          : compactIrrInputButtonRef
                  }
                  id={`compact-input-tab-${section.key}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`compact-input-panel-${section.key}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => selectCompactInputSection(section.key)}
                  className={`tap-feedback flex min-h-[3.5rem] flex-col items-center justify-center rounded-xl border px-2 py-2 text-center transition ${
                    isActive
                      ? 'accent-edge bg-accent/10 text-slate-100'
                      : 'border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] leading-none min-[390px]:text-[11px]">{section.label}</span>
                  <span className={`mt-1 block max-w-full truncate text-[9px] leading-tight min-[390px]:text-[10px] ${isActive ? 'text-slate-200' : 'text-muted'}`}>{section.summary}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="space-y-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}>
        <div key={`compact-mode-${compactMode}`} className="panel-swap space-y-4">
          {compactMode === 'inputs' ? compactInputsView : null}
          {compactMode === 'results' ? compactResultsView : null}
          {compactMode === 'compare' ? compactCompareView : null}
        </div>
      </section>

      <nav
        className="fixed inset-x-3 bottom-3 z-[120] rounded-2xl border border-white/10 bg-surface/95 p-2 shadow-soft backdrop-blur"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }}
      >
        <div className="grid grid-cols-3 gap-2">
          {(['inputs', 'results', 'compare'] as CompactMode[]).map((mode) => {
            const isLocked = mode !== 'inputs' && !compactReadiness.ready;
            const isActive = compactMode === mode;

            return (
              <button
                key={mode}
                ref={mode === 'results' ? compactResultsNavButtonRef : mode === 'compare' ? compactCompareNavButtonRef : null}
                type="button"
                disabled={isLocked}
                onClick={() => {
                  if (!isActive) triggerHapticFeedback('light');
                  setCompactMode(mode);
                }}
                className={`tap-feedback min-h-11 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'btn-primary' : 'border border-white/15 bg-white/[0.03] text-slate-200'
                } disabled:cursor-not-allowed disabled:opacity-45`}
              >
                {compactModeLabels[mode]}
              </button>
            );
          })}
        </div>
      </nav>

      {compactSheets}
    </>
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
        {isMobileViewport ? (
          <header className="panel-surface relative z-[70] rounded-2xl p-4 shadow-soft backdrop-blur">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="brand-lockup" aria-label="DealCooker">
                    <h1 className="brand-text leading-none">DealCooker</h1>
                    <Image src="/icon.png" alt="" width={34} height={34} className="brand-icon" aria-hidden="true" priority />
                  </div>
                  <button
                    type="button"
                    onClick={openDealIdentityEditor}
                    className="tap-feedback mt-2 w-full max-w-[18rem] rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left"
                    aria-label="Edit active deal details"
                  >
                    <p className="text-xs uppercase tracking-[0.16em] text-muted">Active deal</p>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="truncate text-base font-semibold text-slate-100">{activeDealDisplayName}</p>
                      <span className="shrink-0 rounded-full border border-white/15 bg-black/20 px-2 py-0.5 text-[11px] text-slate-200">
                        Edit
                      </span>
                    </div>
                  </button>
                </div>
                <button
                  ref={compactMenuButtonRef}
                  type="button"
                  onClick={() => {
                    triggerHapticFeedback('light');
                    setCompactSheetView('menu');
                  }}
                  className="tap-feedback inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-slate-100"
                  aria-label="Open deal actions"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                    <path d="M5 7.5h14M5 12h14M5 16.5h14" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHapticFeedback('light');
                    createNewDeal('New Deal', '', { openIdentityEditor: true });
                    setCompactMode('inputs');
                    setCompactSheetView(null);
                  }}
                  className="btn-primary rounded-xl px-3 py-2.5 text-sm font-semibold"
                >
                  New deal
                </button>
                <button
                  ref={compactDealsButtonRef}
                  type="button"
                  onClick={() => {
                    triggerHapticFeedback('light');
                    setCompactSheetView('deals');
                  }}
                  className="tap-feedback rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2.5 text-sm font-medium text-slate-100"
                >
                  Recent deals
                </button>
              </div>

              {shareFeedback ? (
                <div
                  role="status"
                  className={`rounded-xl border px-3 py-2 text-xs ${
                    shareFeedback.tone === 'success' ? 'border-accent/45 bg-accent/10 text-slate-100' : 'border-red-500/45 bg-red-500/15 text-red-100'
                  }`}
                >
                  <p>{shareFeedback.message}</p>
                  {shareFeedback.fallbackUrl ? <p className="mt-1 break-all text-[11px]">{shareFeedback.fallbackUrl}</p> : null}
                </div>
              ) : null}

              {syncFeedback ? (
                <div className="rounded-xl border border-red-400/50 bg-red-500/15 px-3 py-2 text-xs text-red-100" role="status">
                  {syncFeedback}
                </div>
              ) : null}

              <PwaInstallBanner />
            </div>
          </header>
        ) : null}

        {!isMobileViewport ? (
        <header className="panel-surface relative z-[70] rounded-2xl p-5 shadow-soft backdrop-blur">
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
              <div className="min-w-0 max-w-3xl">
                <div className="space-y-2">
                  <div ref={authControlsRef} className="flex w-full justify-end">
                    <div className="flex flex-row items-center justify-end gap-1.5">
                      {currentUser ? (
                        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:flex-nowrap sm:gap-2 md:hidden">
                          <span className="inline-flex shrink-0 items-center rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent sm:whitespace-nowrap sm:text-[11px]">
                            Cloud: Active
                          </span>
                          {renderProfileAvatar()}
                          <button
                            type="button"
                            onClick={signOut}
                            disabled={authBusy || !isSupabaseConfigured}
                            className="btn-primary btn-auth btn-auth-top tap-feedback min-h-8 rounded-full px-3 py-1 text-[11px] font-medium md:hidden sm:text-xs disabled:opacity-60"
                          >
                            Sign out
                          </button>
                        </div>
                      ) : (
                        <div className="relative md:hidden">
                          <button
                            type="button"
                            onClick={() => {
                              setIsSettingsOpen(false);
                              setIsAuthMenuOpen((value) => !value);
                            }}
                            aria-expanded={isAuthMenuOpen}
                            aria-controls="auth-menu"
                            className="btn-signin-trigger tap-feedback min-h-8 rounded-full px-3 py-1 text-[11px] font-medium sm:text-xs"
                          >
                            Sign in
                          </button>
                          {isAuthMenuOpen ? (
                            <>
                              <div id="auth-menu" className="absolute right-0 top-10 z-[135] hidden w-72 rounded-xl border border-white/15 bg-surface/95 p-3 shadow-soft backdrop-blur sm:block">
                                {authMenuContent}
                              </div>
                              <div className="fixed inset-0 z-[140] overflow-y-auto bg-black/45 p-4 sm:hidden" onClick={() => setIsAuthMenuOpen(false)}>
                                <div
                                  className="scrollbar-premium mx-auto mt-16 max-h-[calc(100dvh-4rem)] w-full max-w-sm overflow-y-auto rounded-xl border border-white/15 bg-surface/95 p-3 shadow-soft backdrop-blur"
                                  style={{ WebkitOverflowScrolling: 'touch' }}
                                  onClick={(event) => event.stopPropagation()}
                                >
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

                      <div ref={settingsControlsRef} className="relative md:hidden">
                        <button
                          type="button"
                          aria-label="Open settings"
                          aria-expanded={isSettingsOpen}
                          aria-controls="settings-menu-mobile"
                          onClick={() => {
                            setIsAuthMenuOpen(false);
                            setIsSettingsOpen((value) => !value);
                          }}
                          className="btn-settings tap-feedback inline-flex h-8 w-8 items-center justify-center rounded-full"
                        >
                          <svg viewBox="0 0 24 24" className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                            <path d="M11.99 3.8a1 1 0 0 1 .98.8l.28 1.4c.18.06.36.14.53.22l1.22-.73a1 1 0 0 1 1.23.15l1.53 1.53a1 1 0 0 1 .15 1.22l-.73 1.22c.09.18.16.36.22.54l1.4.28a1 1 0 0 1 .8.98v2.16a1 1 0 0 1-.8.98l-1.4.28c-.06.19-.14.37-.22.54l.73 1.22a1 1 0 0 1-.15 1.22l-1.53 1.53a1 1 0 0 1-1.23.15l-1.22-.73c-.17.09-.35.16-.53.22l-.28 1.4a1 1 0 0 1-.98.8H9.83a1 1 0 0 1-.98-.8l-.28-1.4a4.88 4.88 0 0 1-.53-.22l-1.22.73a1 1 0 0 1-1.23-.15L4.06 19.6a1 1 0 0 1-.15-1.22l.73-1.22c-.08-.17-.16-.35-.22-.54l-1.4-.28a1 1 0 0 1-.8-.98V12.2a1 1 0 0 1 .8-.98l1.4-.28c.06-.19.14-.37.22-.54l-.73-1.22a1 1 0 0 1 .15-1.22L5.6 6.43a1 1 0 0 1 1.23-.15l1.22.73c.17-.08.35-.16.53-.22l.28-1.4a1 1 0 0 1 .98-.8h2.16Z" />
                            <circle cx="12" cy="13.28" r="2.7" />
                          </svg>
                        </button>

                        {isSettingsOpen ? (
                          <>
                            <div id="settings-menu-mobile" className="absolute right-0 top-10 z-[136] hidden w-80 max-w-[92vw] rounded-xl border border-white/15 bg-surface/95 p-3 shadow-soft backdrop-blur sm:block">
                              {settingsMenuContent}
                            </div>
                            <div className="fixed inset-0 z-[141] overflow-y-auto bg-black/45 p-4 sm:hidden" onClick={() => setIsSettingsOpen(false)}>
                              <div
                                className="scrollbar-premium mx-auto mt-14 max-h-[calc(100dvh-4rem)] w-full max-w-sm overflow-y-auto rounded-xl border border-white/15 bg-surface/95 p-3 shadow-soft backdrop-blur"
                                style={{ WebkitOverflowScrolling: 'touch' }}
                                onClick={(event) => event.stopPropagation()}
                              >
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

                  <div className="min-w-0">
                    <div className="brand-lockup" aria-label="DealCooker">
                      <h1 className="brand-text leading-none">DealCooker</h1>
                      <Image src="/icon.png" alt="" width={38} height={38} className="brand-icon" aria-hidden="true" priority />
                    </div>
                    <p className="mt-1 max-w-[44ch] text-sm leading-relaxed text-muted">Create addictive, pro-grade real estate strategy snapshots in seconds with instant cash flow, DSCR, ROI, and IRR intelligence.</p>
                  </div>
                </div>
              </div>
              <div className="w-full md:min-w-0 lg:max-w-[560px]">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] md:flex md:items-center md:justify-end md:gap-2">
                  <button
                    type="button"
                    onClick={openDealIdentityEditor}
                    className="hidden min-w-[240px] max-w-[320px] flex-1 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left md:flex"
                    aria-label="Edit active deal details"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-muted">Active deal</p>
                      <p className="truncate text-sm font-medium text-slate-100">{activeDealDisplayName}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/15 bg-black/20 px-2 py-0.5 text-[11px] text-slate-200">
                      Edit
                    </span>
                  </button>
                  <Link
                    href={printToPdfUrl}
                    className="btn-primary btn-pdf inline-flex min-h-10 items-center justify-center rounded-xl px-3 py-1.5 text-xs font-medium sm:min-h-11 sm:px-4 sm:py-2 sm:text-sm md:hidden"
                    target="_blank"
                  >
                    Print to PDF
                  </Link>
                  <button
                    type="button"
                    onClick={shareCurrentDeal}
                    className="btn-primary btn-link min-h-10 rounded-xl px-3 py-1.5 text-xs font-medium sm:min-h-11 sm:px-4 sm:py-2 sm:text-sm md:hidden"
                  >
                    Send link
                  </button>
                  {currentUser ? (
                    <div ref={desktopAuthActionRef} className="hidden md:flex md:items-center md:justify-end md:gap-2">
                      <span className="inline-flex shrink-0 items-center rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                        Cloud: Active
                      </span>
                      {renderProfileAvatar()}
                      <button
                        type="button"
                        onClick={signOut}
                        disabled={authBusy || !isSupabaseConfigured}
                        className="btn-primary btn-auth btn-auth-top tap-feedback min-h-8 rounded-full px-3 py-1 text-[11px] font-medium md:min-h-9 md:px-3.5 md:text-xs disabled:opacity-60"
                      >
                        Sign out
                      </button>
                      <div ref={desktopSettingsControlsRef} className="relative">
                        <button
                          type="button"
                          aria-label="Open settings"
                          aria-expanded={isSettingsOpen}
                          aria-controls="settings-menu-desktop"
                          onClick={() => {
                            setIsAuthMenuOpen(false);
                            setIsSettingsOpen((value) => !value);
                          }}
                          className="btn-settings tap-feedback inline-flex h-8 w-8 items-center justify-center rounded-full"
                        >
                          <svg viewBox="0 0 24 24" className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                            <path d="M11.99 3.8a1 1 0 0 1 .98.8l.28 1.4c.18.06.36.14.53.22l1.22-.73a1 1 0 0 1 1.23.15l1.53 1.53a1 1 0 0 1 .15 1.22l-.73 1.22c.09.18.16.36.22.54l1.4.28a1 1 0 0 1 .8.98v2.16a1 1 0 0 1-.8.98l-1.4.28c-.06.19-.14.37-.22.54l.73 1.22a1 1 0 0 1-.15 1.22l-1.53 1.53a1 1 0 0 1-1.23.15l-1.22-.73c-.17.09-.35.16-.53.22l-.28 1.4a1 1 0 0 1-.98.8H9.83a1 1 0 0 1-.98-.8l-.28-1.4a4.88 4.88 0 0 1-.53-.22l-1.22.73a1 1 0 0 1-1.23-.15L4.06 19.6a1 1 0 0 1-.15-1.22l.73-1.22c-.08-.17-.16-.35-.22-.54l-1.4-.28a1 1 0 0 1-.8-.98V12.2a1 1 0 0 1 .8-.98l1.4-.28c.06-.19.14-.37.22-.54l-.73-1.22a1 1 0 0 1 .15-1.22L5.6 6.43a1 1 0 0 1 1.23-.15l1.22.73c.17-.08.35-.16.53-.22l.28-1.4a1 1 0 0 1 .98-.8h2.16Z" />
                            <circle cx="12" cy="13.28" r="2.7" />
                          </svg>
                        </button>
                        {isSettingsOpen ? (
                          <div id="settings-menu-desktop" className="absolute right-0 top-10 z-[136] w-80 max-w-[92vw] rounded-xl border border-white/15 bg-surface/95 p-3 shadow-soft backdrop-blur">
                            {settingsMenuContent}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div ref={desktopAuthActionRef} className="hidden md:flex md:items-center md:justify-end md:gap-2">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            setIsSettingsOpen(false);
                            setIsAuthMenuOpen((value) => !value);
                          }}
                          aria-expanded={isAuthMenuOpen}
                          aria-controls="auth-menu-desktop"
                          className="btn-signin-trigger tap-feedback min-h-8 rounded-full px-3 py-1 text-[11px] font-medium md:min-h-9 md:px-3.5 md:text-xs"
                        >
                          Sign in
                        </button>
                        {isAuthMenuOpen ? (
                          <div id="auth-menu-desktop" className="absolute right-0 top-12 z-[136] w-72 rounded-xl border border-white/15 bg-surface/95 p-3 shadow-soft backdrop-blur">
                            {authMenuContent}
                          </div>
                        ) : null}
                      </div>
                      <div ref={desktopSettingsControlsRef} className="relative">
                        <button
                          type="button"
                          aria-label="Open settings"
                          aria-expanded={isSettingsOpen}
                          aria-controls="settings-menu-desktop"
                          onClick={() => {
                            setIsAuthMenuOpen(false);
                            setIsSettingsOpen((value) => !value);
                          }}
                          className="btn-settings tap-feedback inline-flex h-8 w-8 items-center justify-center rounded-full"
                        >
                          <svg viewBox="0 0 24 24" className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                            <path d="M11.99 3.8a1 1 0 0 1 .98.8l.28 1.4c.18.06.36.14.53.22l1.22-.73a1 1 0 0 1 1.23.15l1.53 1.53a1 1 0 0 1 .15 1.22l-.73 1.22c.09.18.16.36.22.54l1.4.28a1 1 0 0 1 .8.98v2.16a1 1 0 0 1-.8.98l-1.4.28c-.06.19-.14.37-.22.54l.73 1.22a1 1 0 0 1-.15 1.22l-1.53 1.53a1 1 0 0 1-1.23.15l-1.22-.73c-.17.09-.35.16-.53.22l-.28 1.4a1 1 0 0 1-.98.8H9.83a1 1 0 0 1-.98-.8l-.28-1.4a4.88 4.88 0 0 1-.53-.22l-1.22.73a1 1 0 0 1-1.23-.15L4.06 19.6a1 1 0 0 1-.15-1.22l.73-1.22c-.08-.17-.16-.35-.22-.54l-1.4-.28a1 1 0 0 1-.8-.98V12.2a1 1 0 0 1 .8-.98l1.4-.28c.06-.19.14-.37.22-.54l-.73-1.22a1 1 0 0 1 .15-1.22L5.6 6.43a1 1 0 0 1 1.23-.15l1.22.73c.17-.08.35-.16.53-.22l.28-1.4a1 1 0 0 1 .98-.8h2.16Z" />
                            <circle cx="12" cy="13.28" r="2.7" />
                          </svg>
                        </button>
                        {isSettingsOpen ? (
                          <div id="settings-menu-desktop" className="absolute right-0 top-10 z-[136] w-80 max-w-[92vw] rounded-xl border border-white/15 bg-surface/95 p-3 shadow-soft backdrop-blur">
                            {settingsMenuContent}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
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

            <PwaInstallBanner />

            <div ref={dealVaultRef}>
              <DealsVaultPanel
                deals={deals}
                activeDealId={activeDealId}
                activeDealName={model.purchase.dealName}
                activeDealListingValue={model.purchase.listingUrl}
                activeDealListingUrl={model.purchase.listingUrl ? normalizeListingUrl(model.purchase.listingUrl) : null}
                printToPdfUrl={printToPdfUrl}
                saveStatus={saveStatus}
                onActiveDealChange={openRecentScenario}
                onShareLink={shareCurrentDeal}
                onSaveAs={saveDealAs}
                onRename={renameDeal}
                onCreateNew={createNewDeal}
                onDealNameChange={handleDealNameChange}
                onListingUrlChange={handleListingUrlChange}
                onDelete={removeScenario}
              />
            </div>

          </div>
        </header>
        ) : null}

        {isMobileViewport ? compactShell : null}

        {!isMobileViewport ? (
        <>
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
              <DealWorkoutCard
                model={model}
                strategy={activeStrategy}
                targetIrrPercent={model.assumptions.targetIrrPercent}
                onApply={applyDealWorkoutScenario}
              />
            )}
          </div>
        </section>
        {headlineMetricSection}
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
                    style={getDigestMetricStyle(item)}
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
                    style={getDigestMetricStyle(item)}
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
                    style={getDigestMetricStyle(item)}
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
                    style={getDigestMetricStyle(item)}
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
                  quickScan={strategyQuickScan}
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
              <section ref={desktopStrategyInputsRef} className="grid gap-3">
                <StrategyModuleInputs active={activeStrategy} model={model} onChange={updateModel} />
              </section>
            ) : null}
            <div ref={irrStreamRef}>
              <TimelineCard
                output={result[activeStrategy]}
                assumptions={model.assumptions}
                defaultOpen={Boolean(activeDealId)}
              />
            </div>
            <StrategyComparison data={result} input={model} holdYears={model.assumptions.holdYears} />
          </div>

          {!isMobileViewport ? (
            <div className="space-y-4">
              <div ref={desktopCoreSectionRef}>
                <DealInputPanel
                  value={model}
                  onChange={updateModel}
                  resolveListingDealName={resolveListingDealName}
                  defaultAdvancedOptionsOpen={Boolean(activeDealId)}
                  preferredCoreSection={onboardingHighlightedCoreSection}
                />
              </div>
              <div ref={desktopIrrInputsRef}>
                <AssumptionsPanel assumptions={model.assumptions} onChange={updateAssumptions} showTargetIrrInput={showTargetIrrInput} />
              </div>
            </div>
          ) : null}
        </div>
        </>
        ) : null}
      </div>
      <footer className="rounded-2xl border border-white/10 bg-panel/60 p-4 text-xs text-muted">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>(c) 2026 DealCooker. Created by Dillon Cook. All rights reserved.</p>
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

      {dealIdentitySheet}

      <OnboardingTour
        open={isOnboardingOpen}
        steps={currentOnboardingSteps}
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
        presentation={isMobileViewport ? 'sheet' : 'modal'}
        onClose={() => setIsStrategyWorkOpen(false)}
      />
    </main>
  );
}


