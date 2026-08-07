'use client';

import Link from 'next/link';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction
} from 'react';
import type { User } from '@supabase/supabase-js';
import { AssumptionsPanel } from '@/components/dashboard/assumptions-panel';
import { DealInputPanel } from '@/components/dashboard/deal-input-panel';
import { DealWorkoutCard } from '@/components/dashboard/deal-workout-card';
import { DealsVaultPanel } from '@/components/dashboard/scenario-corner';
import { StrategyComparison } from '@/components/dashboard/strategy-comparison';
import { StrategyInputsWorkspace } from '@/components/dashboard/strategy-inputs-workspace';
import { StrategyModuleInputs } from '@/components/dashboard/strategy-module-inputs';
import { MobileSheet } from '@/components/dashboard/mobile-sheet';
import { OnboardingTour, type OnboardingStep } from '@/components/dashboard/onboarding-tour';
import { StrategyTabs, TurnaroundIcon } from '@/components/dashboard/strategy-tabs';
import { StrategyWorkLightbox } from '@/components/dashboard/strategy-work-lightbox';
import { TimelineCard } from '@/components/dashboard/timeline-card';
import { PwaInstallBanner, PWA_OPEN_INSTALL_EVENT, PWA_QUALIFY_INSTALL_EVENT } from '@/components/dashboard/pwa-install-banner';
import { inputClass } from '@/components/dashboard/form-fields';
import { KpiCard } from '@/components/ui/kpi-card';
import { isOwnerEmail } from '@/lib/admin-access';
import { trackAnalyticsEvent } from '@/lib/analytics';
import { getMarketingAttributionFromSearch, removeMarketingParamsFromUrl } from '@/lib/marketing-attribution';
import {
  ANONYMOUS_DEAL_LIMIT,
  canCreateSavedDeals,
  createDealInVault,
  readDealsFromVault,
  removeDealFromVault,
  saveDealToVault
} from '@/lib/deals-vault-service';
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
import { getAnnualOperatingCashFlows, getTotalCashInvested } from '@/lib/projection-metrics';
import { encodeScenario, setScenarioStorageOwner, writeScenarios } from '@/lib/scenario-storage';
import { deleteSupabaseScenario, fetchSupabaseScenarios, upsertSupabaseScenario } from '@/lib/cloud-scenarios-sync';
import { reportClientError, toClientErrorMessage } from '@/lib/client-error-reporting';
import { decodeDealFromShareParam, encodeDealToShareParam } from '@/lib/share-link';
import { createShortShareLink } from '@/lib/share-links';
import { useFloatingTooltipPosition } from '@/lib/use-floating-tooltip-position';

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
type DesktopWorkspaceMode = 'build' | 'projection' | 'compare';
type CompactSheetView = 'menu' | 'deals' | 'strategy' | 'metrics' | 'timeline' | null;
type WorkspaceViewMode = 'studio' | 'sheet';
type EmailAuthMode = 'signIn' | 'createAccount' | 'resetPassword';
type FeedbackSource = 'settings' | 'reminder';
type FeedbackSubmitState = 'idle' | 'sending' | 'sent' | 'error';
type FeedbackViewport = 'desktop' | 'mobile';
type DealReviewSubmitState = 'idle' | 'sending' | 'sent' | 'error';
type DealReviewSource = 'desktop_header' | 'mobile_header';
type HeadlineMetricId =
  | 'cashToClose'
  | 'capRate'
  | 'cashOnCash'
  | 'dscr'
  | 'roi'
  | 'irr'
  | 'maxAllowableOffer'
  | 'saleCashReturned'
  | 'rehabContingency'
  | 'hardMoneyCost';
type ShareFeedbackAnchor = 'desktop-share' | 'mobile-menu-trigger' | 'deal-identity-share';
type ShareFeedbackState = { tone: 'success' | 'error'; message: string; anchor: ShareFeedbackAnchor; fallbackUrl?: string };
type SyncFeedbackTone = 'info' | 'success' | 'error';
type SyncFeedbackMessage = { tone: SyncFeedbackTone; message: string };

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dealcooker.app').replace(/\/+$/, '');
const appReleaseLabel = process.env.NEXT_PUBLIC_APP_RELEASE ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'local-open-testing';
const PRINT_EXPORT_SCENARIO_ID = 'dealcooker-current-print-preview';
const PRINT_EXPORT_TIMESTAMP = '1970-01-01T00:00:00.000Z';
const PRINT_EXPORT_APP_VERSION = '0.2.0';
const getAuthCallbackUrl = (next?: 'password-reset') => {
  const url = new URL('/auth/callback', appUrl);
  if (next) {
    url.searchParams.set('next', next);
  }
  return url.toString();
};

const compactModeLabels: Record<CompactMode, string> = {
  inputs: 'Inputs',
  results: 'Results',
  compare: 'Projections'
};
const workspaceViewModeOptions: Array<{ value: WorkspaceViewMode; label: string }> = [
  { value: 'studio', label: 'Dashboard' },
  { value: 'sheet', label: 'Spreadsheet' }
];
const headlineMetricOptions: Array<{ id: HeadlineMetricId; label: string }> = [
  { id: 'cashToClose', label: 'Cash to Close' },
  { id: 'capRate', label: 'Cap Rate' },
  { id: 'cashOnCash', label: 'Cash on Cash' },
  { id: 'dscr', label: 'DSCR' },
  { id: 'roi', label: 'ROI' },
  { id: 'irr', label: 'IRR' },
  { id: 'maxAllowableOffer', label: 'Max Offer' },
  { id: 'saleCashReturned', label: 'Sale Cash' },
  { id: 'rehabContingency', label: 'Rehab Buffer' },
  { id: 'hardMoneyCost', label: 'Lender Cost' }
];
const defaultHeadlineMetricOrder: HeadlineMetricId[] = ['cashToClose', 'capRate', 'cashOnCash', 'dscr', 'roi', 'irr'];
const flipHeadlineMetricOrder: HeadlineMetricId[] = ['cashToClose', 'maxAllowableOffer', 'saleCashReturned', 'rehabContingency', 'hardMoneyCost', 'roi'];
const KPI_ORDER_STORAGE_KEY = 'dealcooker-kpi-order:v1';
const FEEDBACK_OPEN_COUNT_STORAGE_KEY = 'dealcooker-feedback-open-count:v1';
const FEEDBACK_SENT_STORAGE_KEY = 'dealcooker-feedback-sent:v1';
const FEEDBACK_LAST_SENT_OPEN_COUNT_STORAGE_KEY = 'dealcooker-feedback-last-sent-open-count:v1';
const SHARE_IMPORT_NOTICE_STORAGE_KEY = 'dealcooker-share-imported:v1';
const FEEDBACK_PROMPT_DELAY_MS = 3000;
const FEEDBACK_MESSAGE_MAX_LENGTH = 1600;
const DEAL_REVIEW_NOTES_MAX_LENGTH = 1800;
const DEAL_REVIEW_SUBMISSIONS_ENABLED = false;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAMPLE_DEAL_NAME = 'Tampa Duplex - Sample Deal';
const anonymousDealLimitMessage = `Sign in to save more than ${ANONYMOUS_DEAL_LIMIT} deals. You can still open, edit, export, or delete existing saved deals.`;
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

const dealReviewFocusOptions = [
  'Purchase decision',
  'Offer price',
  'Rent assumptions',
  'Rehab budget',
  'Financing structure',
  'Strategy fit',
  'Exit value',
  'General review'
];

const getViewportStorageKey = (baseKey: string, viewport: FeedbackViewport) => `${baseKey}:${viewport}`;

const readStoredCount = (key: string) => {
  if (typeof window === 'undefined') return 0;
  const parsed = Number.parseInt(window.localStorage.getItem(key) ?? '0', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const asProfileString = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : '');

const getMetadataString = (metadata: unknown, keys: string[]) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '';
  const record = metadata as Record<string, unknown>;

  for (const key of keys) {
    const value = asProfileString(record[key]);
    if (value) return value;
  }

  return '';
};

const getFeedbackContactFromUser = (user: User | null) => {
  const metadata = user?.user_metadata;
  const givenName = getMetadataString(metadata, ['given_name', 'first_name']);
  const familyName = getMetadataString(metadata, ['family_name', 'last_name']);
  const name = getMetadataString(metadata, ['full_name', 'name', 'display_name']) || [givenName, familyName].filter(Boolean).join(' ');
  const phone =
    asProfileString((user as { phone?: unknown } | null)?.phone) ||
    getMetadataString(metadata, ['phone', 'phone_number', 'mobile', 'mobile_phone']);

  return {
    name,
    email: asProfileString(user?.email),
    phone
  };
};

const getFeedbackSubmitErrorMessage = async (response: Response) => {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error.trim();
    }
  } catch {
    // Fall back to a generic user-facing message below.
  }

  if (response.status === 503) {
    return 'Feedback email is not configured yet.';
  }

  return 'Feedback could not be sent. Try again in a moment.';
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

type ScenarioDigestMode = 'commercial' | 'turnaround';

interface ScenarioDigestContent {
  mode: ScenarioDigestMode;
  items: DigestItem<string>[];
  showAllMobile: boolean;
}

interface ScenarioDigestPanelState {
  content: ScenarioDigestContent | null;
  open: boolean;
  exiting: boolean;
}

const SCENARIO_DIGEST_COLLAPSE_MS = 1250;
const SCENARIO_DIGEST_CONTENT_EXIT_MS = 560;
const SCENARIO_DIGEST_EXIT_UNMOUNT_MS = SCENARIO_DIGEST_CONTENT_EXIT_MS + 80;
const SCENARIO_DIGEST_FLOW_SCROLLBAR_SUPPRESSED_CLASS = 'scenario-flip-flow-scrollbar-suppressed';
const emptyScenarioDigestPanelState = (): ScenarioDigestPanelState => ({
  content: null,
  open: false,
  exiting: false
});
const useScenarioDigestPanel = (content: ScenarioDigestContent | null): ScenarioDigestPanelState => {
  const [panel, setPanel] = useState<ScenarioDigestPanelState>(() => emptyScenarioDigestPanelState());

  useLayoutEffect(() => {
    let closeTimer: number | undefined;

    if (content) {
      setPanel({
        content,
        open: true,
        exiting: false
      });
    } else {
      setPanel((current) => {
        if (!current.content) return current;
        if (current.exiting) return current;

        return {
          ...current,
          open: false,
          exiting: true
        };
      });
      closeTimer = window.setTimeout(() => {
        setPanel((current) => (!current.open ? emptyScenarioDigestPanelState() : current));
      }, SCENARIO_DIGEST_EXIT_UNMOUNT_MS);
    }

    return () => {
      if (closeTimer !== undefined) window.clearTimeout(closeTimer);
    };
  }, [content]);

  return {
    content: content ?? panel.content,
    open: Boolean(content),
    exiting: !content && panel.exiting
  };
};
const getTranslateYFromTransform = (transform: string) => {
  if (!transform || transform === 'none') return 0;

  const matrix3dMatch = transform.match(/^matrix3d\((.+)\)$/);
  if (matrix3dMatch) {
    const values = matrix3dMatch[1].split(',').map((value) => Number.parseFloat(value.trim()));
    return Number.isFinite(values[13]) ? values[13] : 0;
  }

  const matrixMatch = transform.match(/^matrix\((.+)\)$/);
  if (matrixMatch) {
    const values = matrixMatch[1].split(',').map((value) => Number.parseFloat(value.trim()));
    return Number.isFinite(values[5]) ? values[5] : 0;
  }

  return 0;
};
const useDigestFlowTransition = () => {
  const ref = useRef<HTMLDivElement | null>(null);
  const firstTopRef = useRef<number | null>(null);
  const motionUntilRef = useRef(0);
  const animationRef = useRef<Animation | null>(null);
  const scrollbarSuppressTimerRef = useRef<number | undefined>(undefined);

  const clearScrollbarSuppressTimer = useCallback(() => {
    if (scrollbarSuppressTimerRef.current === undefined || typeof window === 'undefined') return;
    window.clearTimeout(scrollbarSuppressTimerRef.current);
    scrollbarSuppressTimerRef.current = undefined;
  }, []);

  const releaseLocalScrollbars = useCallback(() => {
    clearScrollbarSuppressTimer();
    ref.current?.classList.remove(SCENARIO_DIGEST_FLOW_SCROLLBAR_SUPPRESSED_CLASS);
  }, [clearScrollbarSuppressTimer]);

  const prepare = useCallback(() => {
    if (typeof window === 'undefined') return;

    const node = ref.current;
    if (!node) return;

    firstTopRef.current = node.getBoundingClientRect().top;
    motionUntilRef.current = window.performance.now() + SCENARIO_DIGEST_COLLAPSE_MS + 350;
    node.classList.add(SCENARIO_DIGEST_FLOW_SCROLLBAR_SUPPRESSED_CLASS);
    clearScrollbarSuppressTimer();
    scrollbarSuppressTimerRef.current = window.setTimeout(() => {
      releaseLocalScrollbars();
    }, SCENARIO_DIGEST_COLLAPSE_MS + 220);
  }, [clearScrollbarSuppressTimer, releaseLocalScrollbars]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const node = ref.current;
    if (!node) return;

    const nextTop = node.getBoundingClientRect().top;
    const firstTop = firstTopRef.current;

    if (firstTop === null) return;
    firstTopRef.current = null;
    if (window.performance.now() > motionUntilRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const layoutDelta = firstTop - nextTop;
    if (Math.abs(layoutDelta) < 1) return;

    const computedTransform = window.getComputedStyle(node).transform;
    const activeTransformY = getTranslateYFromTransform(computedTransform);
    const startY = activeTransformY + layoutDelta;

    const previousAnimation = animationRef.current;
    animationRef.current = null;
    previousAnimation?.cancel();

    node.style.willChange = 'transform';
    const animation = node.animate(
      [
        { transform: `translate3d(0, ${startY}px, 0)` },
        { transform: 'translate3d(0, 0, 0)' }
      ],
      {
        duration: SCENARIO_DIGEST_COLLAPSE_MS,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'both'
      }
    );

    animationRef.current = animation;
    animation.onfinish = () => {
      if (animationRef.current !== animation) return;
      animationRef.current = null;
      node.style.willChange = '';
      animation.cancel();
    };
    animation.oncancel = () => {
      if (animationRef.current !== animation) return;
      animationRef.current = null;
      node.style.willChange = '';
    };
  });

  useEffect(() => {
    return () => {
      animationRef.current?.cancel();
      releaseLocalScrollbars();
    };
  }, [releaseLocalScrollbars]);

  return { ref, prepare };
};
const COMMERCIAL_OUTPUT_ORDER_STORAGE_KEY = 'dealcooker-commercial-output-order:v1';
const LONG_TERM_TURNAROUND_OUTPUT_ORDER_STORAGE_KEY = 'dealcooker-long-term-turnaround-output-order:v1';
const SETTINGS_DEFAULT_STRATEGY_STORAGE_KEY = 'dealcooker-default-strategy:v1';
const SETTINGS_DEFAULT_PROJECTION_STRATEGIES_STORAGE_KEY = 'dealcooker-default-projection-strategies:v2';
const SETTINGS_LIGHT_MODE_STORAGE_KEY = 'dealcooker-light-mode:v1';
const SETTINGS_QUICK_SCAN_VISIBLE_STORAGE_KEY = 'dealcooker-show-quick-scan:v1';
const SETTINGS_WORKSPACE_VIEW_STORAGE_KEY = 'dealcooker-workspace-view:v1';
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
const DigestMetricCard = memo(function DigestMetricCard({
  item,
  variant
}: {
  item: DigestItem<string>;
  variant: 'mobile' | 'desktop';
}) {
  const isMobile = variant === 'mobile';

  return (
    <article className={`scenario-digest-card dashboard-block min-w-0 rounded-lg ${isMobile ? 'px-2 py-1.5' : 'px-2.5 py-2'}`}>
      <p className={`dashboard-meta truncate ${isMobile ? 'text-[10px]' : 'text-[11px]'}`}>{item.label}</p>
      <p
        key={`${item.key}-${item.value}`}
        className={`scenario-digest-value ${isMobile ? 'mt-0.5 text-xs leading-tight' : 'mt-1 text-sm'} truncate font-semibold text-slate-100`}
        style={getDigestMetricStyle(item)}
      >
        {item.value}
      </p>
    </article>
  );
});
const normalizeWorkspaceViewMode = (value: unknown): WorkspaceViewMode => (value === 'sheet' ? 'sheet' : 'studio');
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
    id: 'desktopDeals',
    title: 'Your Saved Deals Are Here',
    body: 'Click Deal Vault when you want to reopen something you already worked on. It is also where you can duplicate or remove older deal scenarios.'
  },
  {
    id: 'desktopStrategy',
    title: 'Pick the Strategy First',
    body: 'Use these strategy tabs to choose the kind of deal you want to analyze. You can switch between Commercial, Long-Term, Airbnb, PadSplit, BRRRR, and Flip at any time.'
  },
  {
    id: 'desktopCore',
    title: 'Purchase Terms Stay Open',
    body: 'Start in the Purchase lane when you are entering the purchase price, rehab budget, financing, and cash needed to buy the property.'
  },
  {
    id: 'desktopExpenses',
    title: 'Expenses Stay Beside It',
    body: 'Use the Expenses lane for taxes, insurance, HOA or PMI, and other operating costs so the deal reflects the real monthly burden.'
  },
  {
    id: 'desktopStrategyInputs',
    title: 'Strategy Assumptions Are Live',
    body: 'Use the Strategy lane for plan-specific numbers, like rent, nightly rate, refinance details, or flip assumptions.'
  },
  {
    id: 'desktopIrr',
    title: 'Timeline and IRR Live Here',
    body: 'Use this section when you want to set how long you will keep the property and how you expect to exit. Those choices affect the return timeline.'
  },
  {
    id: 'desktopResults',
    title: 'The Verdict Stays Up Top',
    body: 'As you update the deal, this ribbon keeps the main numbers in view so you can check cash flow, returns, and the overall verdict without switching screens.'
  },
  {
    id: 'desktopCompare',
    title: 'Use Projections to Model the Future',
    body: 'This area shows how cash flow, equity, and returns could build over time. You can compare multiple strategies side by side while staying on the same page.'
  },
  {
    id: 'desktopActions',
    title: 'Desktop Actions Live Up Top',
    body: 'Use the header actions for sharing, printing, signing in, and changing settings. Desktop keeps those extra tools visible instead of placing them behind a single menu.'
  }
];
const mobileOnboardingSteps: OnboardingStep[] = [
  {
    id: 'mobileDeals',
    title: 'Your Saved Deals Are Here',
    body: 'Tap Deal Vault when you want to reopen something you already worked on. It is also where you can duplicate or remove older deal scenarios.'
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
    body: 'Use Strategy after you choose your approach. That section holds the income and plan-specific numbers, like rent, nightly rate, refinance details, or flip assumptions.'
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

function ReserveModeTooltip({ strategy, includeReserves }: { strategy: StrategyKey; includeReserves: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const closeTooltipTimerRef = useRef<number | null>(null);
  const tooltipAnchorRef = useRef<HTMLDivElement | null>(null);
  const tooltipTriggerRef = useRef<HTMLButtonElement | null>(null);
  const tooltipPanelRef = useRef<HTMLDivElement | null>(null);
  const { style: tooltipStyle } = useFloatingTooltipPosition({
    open: isOpen,
    anchorRef: tooltipTriggerRef,
    tooltipRef: tooltipPanelRef,
    preferredPlacement: 'bottom',
    maxWidth: 320,
    offset: 10,
    zIndex: 190
  });

  const reserveLabel = strategy === 'purchase' ? 'TI and leasing reserves' : 'maintenance and CapEx reserves';
  const includeCopy =
    strategy === 'purchase'
      ? 'Include reserves subtracts TI and leasing reserves for a more conservative strip-plaza cash flow view.'
      : 'Include reserves subtracts maintenance and CapEx reserves for a more conservative monthly cash flow view.';
  const excludeCopy =
    strategy === 'purchase'
      ? 'Exclude reserves shows operating cash flow before TI and leasing reserves are held back.'
      : 'Exclude reserves shows operating cash flow before maintenance and CapEx reserves are held back.';

  const clearCloseTooltipTimer = () => {
    if (closeTooltipTimerRef.current === null) return;
    window.clearTimeout(closeTooltipTimerRef.current);
    closeTooltipTimerRef.current = null;
  };

  const openTooltip = () => {
    clearCloseTooltipTimer();
    setIsOpen(true);
  };

  const scheduleCloseTooltip = () => {
    clearCloseTooltipTimer();
    closeTooltipTimerRef.current = window.setTimeout(() => {
      setIsOpen(false);
      closeTooltipTimerRef.current = null;
    }, 90);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (tooltipAnchorRef.current?.contains(target)) return;
      if (tooltipPanelRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(
    () => () => {
      clearCloseTooltipTimer();
    },
    []
  );

  return (
    <div ref={tooltipAnchorRef} className="inline-flex">
      <button
        ref={tooltipTriggerRef}
        type="button"
        aria-label="Reserve mode explanation"
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation();
          clearCloseTooltipTimer();
          setIsOpen((prev) => !prev);
        }}
        onMouseEnter={openTooltip}
        onMouseLeave={scheduleCloseTooltip}
        onFocus={openTooltip}
        onBlur={scheduleCloseTooltip}
        className="info-trigger tap-feedback inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold opacity-85"
      >
        i
      </button>

      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={tooltipPanelRef}
              className="tooltip-surface rounded-xl p-3 text-xs leading-relaxed"
              style={tooltipStyle}
              onClick={(event) => event.stopPropagation()}
              onMouseEnter={openTooltip}
              onMouseLeave={scheduleCloseTooltip}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Reserve mode</p>
                <button
                  type="button"
                  className="tooltip-close tap-feedback rounded-md px-2 py-0.5 text-[11px]"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsOpen(false);
                  }}
                >
                  Close
                </button>
              </div>
              <p className="mb-2 text-slate-200">
                Current mode: <span className="font-semibold text-white">{includeReserves ? 'Include reserves' : 'Exclude reserves'}</span>
              </p>
              <p className="mb-2 text-slate-200">
                <span className="font-semibold text-white">Include reserves:</span> {includeCopy}
              </p>
              <p className="text-slate-200">
                <span className="font-semibold text-white">Exclude reserves:</span> {excludeCopy}
              </p>
              <p className="mt-2 text-[11px] text-slate-400">Reserve category: {reserveLabel}</p>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}




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

const buildSampleDealPayload = (): DealInputModel => {
  const base = cloneDefaultDealPayload();

  return {
    ...base,
    purchase: {
      ...base.purchase,
      dealName: SAMPLE_DEAL_NAME,
      listingUrl: '',
      purchasePrice: 285000,
      rehabBudget: 25000,
      arv: 340000
    },
    commercial: {
      ...base.commercial,
      grossLeasableAreaSqft: 9000,
      occupiedSqft: 8100,
      averageBaseRentPerSqftYear: 28,
      nnnRecoveryPerSqftYear: 9
    },
    longTerm: {
      ...base.longTerm,
      grossRentMonthly: 3200,
      otherIncomeMonthly: 75,
      turnaround: {
        ...base.longTerm.turnaround,
        enabled: true,
        stabilizedGrossRentMonthly: 3600,
        additionalIncomeMonthly: 100,
        rehabBudgetForStabilization: 25000
      }
    },
    airbnb: {
      ...base.airbnb,
      adr: 185,
      occupancyPercent: 0.66
    },
    padSplit: {
      ...base.padSplit,
      rentableRooms: 5,
      avgWeeklyRatePerRoom: 215
    },
    brrrr: {
      ...base.brrrr,
      holdingMonths: 6,
      rehabOverride: 25000,
      arvOverride: 340000
    },
    flip: {
      ...base.flip,
      holdingMonths: 5,
      rehabOverride: 25000,
      arvOverride: 340000
    }
  };
};
const defaultNewDealStrategyFallback: StrategyKey = 'longTerm';
const defaultProjectionStrategySelectionFallback: StrategyKey[] = [defaultNewDealStrategyFallback];
const areStrategySelectionsEqual = (left: StrategyKey[], right: StrategyKey[]) =>
  left.length === right.length && left.every((strategy, index) => strategy === right[index]);

export default function HomePage() {
  const [model, setModel] = useState(() => buildNewDealPayload('New Deal'));
  const [activeStrategy, setActiveStrategy] = useState<StrategyKey>(
    defaultNewDealStrategyFallback
  );
  const [deals, setDeals] = useState<ScenarioRecord[]>([]);
  const [activeDealId, setActiveDealId] = useState('');
  const [defaultNewDealStrategy, setDefaultNewDealStrategy] = useState<StrategyKey>(defaultNewDealStrategyFallback);
  const [defaultProjectionStrategies, setDefaultProjectionStrategies] = useState<StrategyKey[]>(defaultProjectionStrategySelectionFallback);
  const [isLightMode, setIsLightMode] = useState(true);
  const [isQuickScanVisible, setIsQuickScanVisible] = useState(true);
  const [workspaceViewMode, setWorkspaceViewMode] = useState<WorkspaceViewMode>('studio');
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
  const [shareFeedback, setShareFeedback] = useState<ShareFeedbackState | null>(null);
  const [compactMode, setCompactMode] = useState<CompactMode>('inputs');
  const [compactSheetView, setCompactSheetView] = useState<CompactSheetView>(null);
  const [compactInputSection, setCompactInputSection] = useState<CompactInputSection>('core');
  const [desktopInputSection, setDesktopInputSection] = useState<CompactInputSection>('core');
  const [desktopWorkspaceMode, setDesktopWorkspaceMode] = useState<DesktopWorkspaceMode>('build');
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [showAllCommercialMobileOutputs, setShowAllCommercialMobileOutputs] = useState(false);
  const [showAllLongTermTurnaroundMobileOutputs, setShowAllLongTermTurnaroundMobileOutputs] = useState(false);
  const [compactSelectedStrategies, setCompactSelectedStrategies] = useState<StrategyKey[]>(defaultProjectionStrategySelectionFallback);
  const [compactDealsSearch, setCompactDealsSearch] = useState('');
  const [headlineMetricOrder, setHeadlineMetricOrder] = useState<HeadlineMetricId[]>(defaultHeadlineMetricOrder);
  const [isHeadlineMetricOrderEditorOpen, setIsHeadlineMetricOrderEditorOpen] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isClientMounted, setIsClientMounted] = useState(false);
  const [feedbackViewport, setFeedbackViewport] = useState<FeedbackViewport | null>(null);
  const [isFeedbackPromptOpen, setIsFeedbackPromptOpen] = useState(false);
  const [isFeedbackComposerOpen, setIsFeedbackComposerOpen] = useState(false);
  const [feedbackSource, setFeedbackSource] = useState<FeedbackSource>('settings');
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [feedbackSubmitState, setFeedbackSubmitState] = useState<FeedbackSubmitState>('idle');
  const [feedbackSubmitMessage, setFeedbackSubmitMessage] = useState<string | null>(null);
  const [isDealReviewOpen, setIsDealReviewOpen] = useState(false);
  const [dealReviewName, setDealReviewName] = useState('');
  const [dealReviewEmail, setDealReviewEmail] = useState('');
  const [dealReviewPhone, setDealReviewPhone] = useState('');
  const [dealReviewMarket, setDealReviewMarket] = useState('');
  const [dealReviewFocus, setDealReviewFocus] = useState(dealReviewFocusOptions[0]);
  const [dealReviewNotes, setDealReviewNotes] = useState('');
  const [dealReviewConsent, setDealReviewConsent] = useState(false);
  const [dealReviewSource, setDealReviewSource] = useState<DealReviewSource>('desktop_header');
  const [dealReviewSubmitState, setDealReviewSubmitState] = useState<DealReviewSubmitState>('idle');
  const [dealReviewSubmitMessage, setDealReviewSubmitMessage] = useState<string | null>(null);
  const [isDealIdentityOpen, setIsDealIdentityOpen] = useState(false);
  const [isDesktopDealVaultOpen, setIsDesktopDealVaultOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [hasResolvedInitialAuth, setHasResolvedInitialAuth] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [isAuthMenuOpen, setIsAuthMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);
  const [emailAuthMode, setEmailAuthMode] = useState<EmailAuthMode>('signIn');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetPasswordConfirmValue, setResetPasswordConfirmValue] = useState('');
  const [authFeedback, setAuthFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const hasLoadedSupabaseDeals = useRef(false);
  const pushTimerRef = useRef<number | null>(null);
  const feedbackOpenCountedRef = useRef(false);
  const queuedPushScenarioIdRef = useRef<string | null>(null);
  const pendingDeleteIdsRef = useRef<Set<string>>(new Set());
  const pendingUpsertIdsRef = useRef<Set<string>>(new Set());
  const activeVaultOwnerIdRef = useRef<string | null>(null);
  const hasHydratedLocalVaultRef = useRef(false);
  const appOpenTrackedRef = useRef(false);
  const activeDealUiStatePresenceRef = useRef({ hasActiveStrategy: false, hasProjectionStrategies: false });
  const [syncFeedback, setSyncFeedback] = useState<SyncFeedbackMessage | null>(null);
  const [isRetryingCloudSync, setIsRetryingCloudSync] = useState(false);
  const [fetchedScenarioCount, setFetchedScenarioCount] = useState(0);
  const [lastCloudError, setLastCloudError] = useState<string | null>(null);
  const [cloudHealth, setCloudHealth] = useState<'ok' | 'error' | 'idle'>('idle');
  const [baselineComplete, setBaselineCompleteState] = useState(false);
  const [baselineUpsertsCount, setBaselineUpsertsCount] = useState(0);
  const [prunedLocalCount, setPrunedLocalCount] = useState(0);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingStepIndex, setOnboardingStepIndex] = useState(0);
  const pendingNewDealDraftRef = useRef<{ initialDealName: string; previousDealId: string; scenarioId: string } | null>(null);

  const showSyncFeedback = useCallback((message: string, tone: SyncFeedbackTone = 'info') => {
    setSyncFeedback({ message, tone });
  }, []);

  const hasVaultCapacityForNewDeals = useCallback(
    (additionalDealCount = 1, currentDealCount = deals.length) =>
      canCreateSavedDeals({
        isSignedIn: Boolean(currentUser?.id),
        currentDealCount,
        additionalDealCount
      }),
    [currentUser?.id, deals.length]
  );

  const showAnonymousDealLimitPrompt = useCallback(() => {
    triggerHapticFeedback('medium');
    showSyncFeedback(anonymousDealLimitMessage, 'info');
  }, [showSyncFeedback]);

  const guardNewSavedDeals = useCallback(
    (additionalDealCount = 1, currentDealCount = deals.length) => {
      if (hasVaultCapacityForNewDeals(additionalDealCount, currentDealCount)) return true;
      showAnonymousDealLimitPrompt();
      return false;
    },
    [deals.length, hasVaultCapacityForNewDeals, showAnonymousDealLimitPrompt]
  );

  const dealVaultRef = useRef<HTMLButtonElement | null>(null);
  const desktopHeaderActionsRef = useRef<HTMLDivElement | null>(null);
  const authControlsRef = useRef<HTMLDivElement | null>(null);
  const desktopAuthActionRef = useRef<HTMLDivElement | null>(null);
  const settingsControlsRef = useRef<HTMLDivElement | null>(null);
  const desktopSettingsControlsRef = useRef<HTMLDivElement | null>(null);
  const importBackupInputRef = useRef<HTMLInputElement | null>(null);
  const compactInputsViewRef = useRef<HTMLDivElement | null>(null);
  const mobileCoreSectionRef = useRef<HTMLDivElement | null>(null);
  const mobileExpensesSectionRef = useRef<HTMLDivElement | null>(null);
  const mobileStrategyInputsRef = useRef<HTMLDivElement | null>(null);
  const mobileIrrSectionRef = useRef<HTMLDivElement | null>(null);
  const desktopCoreSectionRef = useRef<HTMLDivElement | null>(null);
  const desktopExpensesSectionRef = useRef<HTMLDivElement | null>(null);
  const desktopResultsSectionRef = useRef<HTMLElement | null>(null);
  const desktopStrategyTabsRef = useRef<HTMLDivElement | null>(null);
  const desktopStrategyInputsRef = useRef<HTMLDivElement | null>(null);
  const desktopCompareSectionRef = useRef<HTMLDivElement | null>(null);
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
  const activeScenarioForExport = useMemo(
    () => deals.find((deal) => deal.scenarioId === activeDealId),
    [activeDealId, deals]
  );
  const exportPayload = useMemo(
    () =>
      encodeScenario({
        schemaVersion: '1.0.0',
        scenarioId: activeScenarioForExport?.scenarioId ?? PRINT_EXPORT_SCENARIO_ID,
        appVersion: activeScenarioForExport?.appVersion ?? PRINT_EXPORT_APP_VERSION,
        dealName: model.purchase.dealName,
        createdAt: activeScenarioForExport?.createdAt ?? PRINT_EXPORT_TIMESTAMP,
        updatedAt: activeScenarioForExport?.updatedAt ?? PRINT_EXPORT_TIMESTAMP,
        tags: activeScenarioForExport?.tags ?? [],
        payload: attachDealUiState(model)
      }),
    [activeScenarioForExport, attachDealUiState, model]
  );
  const printToPdfUrl = useMemo(() => `/print?scenario=${exportPayload}&strategy=${activeStrategy}`, [activeStrategy, exportPayload]);

  const activeOutput = result[activeStrategy];
  const commercialSummary = activeStrategy === 'purchase' ? activeOutput.commercialSummary : undefined;
  const longTermTurnaroundSummary = activeStrategy === 'longTerm' ? activeOutput.longTermTurnaroundSummary : undefined;
  const isLongTermTurnaroundActive = activeStrategy === 'longTerm' && Boolean(longTermTurnaroundSummary?.enabled);
  const activeModeLabel = isLongTermTurnaroundActive ? 'Long-Term Turnaround' : activeStrategyLabels[activeStrategy];
  const longTermPurchaseOutput = useMemo(() => {
    if (!model.longTerm.turnaround.enabled) return result.longTerm;

    return calculateDeal({
      ...model,
      longTerm: {
        ...model.longTerm,
        turnaround: {
          ...model.longTerm.turnaround,
          enabled: false
        }
      }
    }).longTerm;
  }, [model, result.longTerm]);
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
  const showCommercialDigestSection = activeStrategy === 'purchase' && commercialDigestItems.length > 0;
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
  const showLongTermTurnaroundDigestSection = activeStrategy === 'longTerm' && longTermTurnaroundDigestItems.length > 0;
  const visibleDigestContent = useMemo<ScenarioDigestContent | null>(() => {
    if (showCommercialDigestSection) {
      return {
        mode: 'commercial',
        items: commercialDigestItems,
        showAllMobile: showAllCommercialMobileOutputs
      };
    }

    if (showLongTermTurnaroundDigestSection) {
      return {
        mode: 'turnaround',
        items: longTermTurnaroundDigestItems,
        showAllMobile: showAllLongTermTurnaroundMobileOutputs
      };
    }

    return null;
  }, [
    commercialDigestItems,
    longTermTurnaroundDigestItems,
    showAllCommercialMobileOutputs,
    showAllLongTermTurnaroundMobileOutputs,
    showCommercialDigestSection,
    showLongTermTurnaroundDigestSection
  ]);
  const scenarioDigestPanel = useScenarioDigestPanel(visibleDigestContent);
  const { ref: desktopPostDigestFlowRef, prepare: prepareDesktopDigestFlip } = useDigestFlowTransition();
  const displayedDigestMode = scenarioDigestPanel.content?.mode;
  const displayedCommercialDigestItems =
    displayedDigestMode === 'commercial' ? scenarioDigestPanel.content?.items ?? [] : commercialDigestItems;
  const displayedLongTermTurnaroundDigestItems =
    displayedDigestMode === 'turnaround' ? scenarioDigestPanel.content?.items ?? [] : longTermTurnaroundDigestItems;
  const displayedShowAllCommercialMobileOutputs =
    displayedDigestMode === 'commercial' ? Boolean(scenarioDigestPanel.content?.showAllMobile) : showAllCommercialMobileOutputs;
  const displayedShowAllLongTermTurnaroundMobileOutputs =
    displayedDigestMode === 'turnaround' ? Boolean(scenarioDigestPanel.content?.showAllMobile) : showAllLongTermTurnaroundMobileOutputs;
  const mobileCommercialOutputDefaultCount = 4;
  const primaryMobileCommercialDigestItems = displayedCommercialDigestItems.slice(0, mobileCommercialOutputDefaultCount);
  const additionalMobileCommercialDigestItems = displayedCommercialDigestItems.slice(mobileCommercialOutputDefaultCount);
  const hasHiddenCommercialMobileOutputs = additionalMobileCommercialDigestItems.length > 0;
  const mobileLongTermTurnaroundOutputDefaultCount = 4;
  const primaryMobileLongTermTurnaroundDigestItems = displayedLongTermTurnaroundDigestItems.slice(0, mobileLongTermTurnaroundOutputDefaultCount);
  const additionalMobileLongTermTurnaroundDigestItems = displayedLongTermTurnaroundDigestItems.slice(mobileLongTermTurnaroundOutputDefaultCount);
  const hasHiddenLongTermTurnaroundMobileOutputs = additionalMobileLongTermTurnaroundDigestItems.length > 0;
  const isScenarioDigestRendered = Boolean(scenarioDigestPanel.content);
  const isScenarioDigestExiting = scenarioDigestPanel.exiting;
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
  const onboardingTargetLayoutKey = `${workspaceViewMode}:${compactMode}:${compactInputSection}:${compactSheetView ?? 'closed'}:${desktopWorkspaceMode}:${desktopInputSection}`;
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
  const renderHeadlineMetricCard = (metricId: HeadlineMetricId, layout: 'default' | 'compact' | 'inline' = 'default'): ReactNode => {
    const metricOutput = isLongTermTurnaroundActive ? longTermPurchaseOutput : activeOutput;
    const metricModeLabel = isLongTermTurnaroundActive ? activeStrategyLabels.longTerm : activeModeLabel;
    const flipMeta = metricOutput.calculationBreakdown?.flipMeta;

    switch (metricId) {
      case 'cashToClose':
        if (activeStrategy === 'flip') {
          return (
            <KpiCard
              label="Cash Invested"
              value={currencyFormatter.format(metricOutput.totalCashNeeded)}
              winner={metricModeLabel}
              secondaryLabel="Before holding"
              secondaryValue={currencyFormatter.format(flipMeta?.cashInvestedBeforeHolding ?? 0)}
              definitions={[
                {
                  term: 'Cash Invested',
                  description: 'All modeled cash in the flip, including cash invested before holding plus fixed, variable, and lender holding costs.'
                },
                {
                  term: 'Before holding',
                  description: 'Cash needed before monthly carry: down payment or hard-money gap, rehab with contingency, closing costs, points, and lender fees.'
                }
              ]}
              layout={layout}
              inlineValueScale="large"
            />
          );
        }

        return (
            <KpiCard
              label="Cash to Close"
              value={currencyFormatter.format(cashToCloseValue)}
              winner={metricModeLabel}
              secondaryLabel="Total cash invested"
              secondaryValue={currencyFormatter.format(getTotalCashInvested(metricOutput))}
            definitions={[
              {
                term: 'Cash to Close',
                description: 'Cash needed at closing only (down payment, closing costs, points, and HELOC close costs). Excludes rehab and one-time setup costs.'
              },
              {
                term: 'Total cash invested',
                description: 'All modeled cash contributions across the deal, including closing, rehab, setup, operating shortfalls, and debt payoffs.'
              }
            ]}
            layout={layout}
            inlineValueScale="large"
          />
        );
      case 'maxAllowableOffer': {
        const maxOffer = flipMeta?.maxAllowableOffer ?? null;
        const targetSummary =
          flipMeta && (flipMeta.targetProfit > 0 || flipMeta.targetRoiPercent > 0)
            ? `${flipMeta.targetProfit > 0 ? currencyFormatter.format(flipMeta.targetProfit) : 'No profit target'} / ${
                flipMeta.targetRoiPercent > 0 ? percentFormatter.format(flipMeta.targetRoiPercent) : 'No ROI target'
              }`
            : 'Set targets';

        return (
          <KpiCard
            label="Max Offer"
            value={maxOffer === null ? 'No fit' : currencyFormatter.format(maxOffer)}
            numericValue={maxOffer ?? -1}
            numericValueKind="currency"
            winner={metricModeLabel}
            secondaryLabel="Targets"
            secondaryValue={targetSummary}
            definitions={[
              {
                term: 'Max Offer',
                description: 'Highest purchase price that still meets your target profit and target ROI. If both are set, the stricter target wins.'
              }
            ]}
            layout={layout}
            inlineValueScale="large"
          />
        );
      }
      case 'saleCashReturned':
        return (
          <KpiCard
            label="Sale Cash"
            value={currencyFormatter.format(flipMeta?.saleCashReturned ?? metricOutput.saleProceeds ?? 0)}
            numericValue={flipMeta?.saleCashReturned ?? metricOutput.saleProceeds ?? 0}
            numericValueKind="currency"
            winner={metricModeLabel}
            secondaryLabel="Debt payoff"
            secondaryValue={currencyFormatter.format(flipMeta?.debtPayoffAtSale ?? 0)}
            definitions={[
              {
                term: 'Sale Cash',
                description: 'Cash returned at resale after agent commission, seller closing costs, concessions, and debt payoff.'
              }
            ]}
            layout={layout}
            inlineValueScale="large"
          />
        );
      case 'rehabContingency':
        return (
          <KpiCard
            label="Rehab Buffer"
            value={currencyFormatter.format(flipMeta?.rehabContingency ?? 0)}
            numericValue={flipMeta?.rehabContingency ?? 0}
            numericValueKind="currency"
            winner={metricModeLabel}
            secondaryLabel={`${percentFormatter.format(flipMeta?.rehabContingencyPercent ?? 0)} contingency`}
            secondaryValue={currencyFormatter.format(flipMeta?.rehabBudget ?? 0)}
            definitions={[
              {
                term: 'Rehab Buffer',
                description: 'Contingency dollars added on top of the base flip rehab budget. The secondary value is total rehab including the buffer.'
              }
            ]}
            layout={layout}
            inlineValueScale="large"
          />
        );
      case 'hardMoneyCost': {
        const lenderCost = (flipMeta?.hardMoneyInterestCost ?? 0) + (flipMeta?.pointsCost ?? 0) + (flipMeta?.hardMoneyOtherFees ?? 0);

        return (
          <KpiCard
            label="Lender Cost"
            value={flipMeta?.hardMoneyEnabled ? currencyFormatter.format(lenderCost) : 'Purchase loan'}
            numericValue={flipMeta?.hardMoneyEnabled ? lenderCost : 0}
            numericValueKind="currency"
            winner={metricModeLabel}
            secondaryLabel={flipMeta?.hardMoneyEnabled ? 'HM loan' : 'Debt payoff'}
            secondaryValue={
              flipMeta?.hardMoneyEnabled
                ? currencyFormatter.format(flipMeta.hardMoneyLoanAmount)
                : currencyFormatter.format(flipMeta?.debtPayoffAtSale ?? 0)
            }
            definitions={[
              {
                term: 'Lender Cost',
                description: 'For hard-money flips this adds interest, points, and other lender fees. Otherwise the flip uses the purchase financing settings.'
              }
            ]}
            layout={layout}
            inlineValueScale="large"
          />
        );
      }
      case 'capRate':
        return (
          <KpiCard
            label="Cap Rate"
            value={percentFormatter.format(metricOutput.capRate)}
            numericValue={metricOutput.capRate}
            numericValueKind="percent"
            helper="Annual NOI / current property value"
            winner={metricModeLabel}
            layout={layout}
            inlineValueScale="large"
          />
        );
      case 'cashOnCash':
        return (
          <KpiCard
            label="Cash on Cash"
            value={percentFormatter.format(metricOutput.cashOnCashReturn)}
            numericValue={metricOutput.cashOnCashReturn}
            numericValueKind="percent"
            helper="Annual cash flow / total cash invested"
            winner={metricModeLabel}
            layout={layout}
            inlineValueScale="large"
          />
        );
      case 'dscr':
        return (
          <KpiCard
            label="DSCR"
            value={metricOutput.dscr.toFixed(2)}
            numericValue={metricOutput.dscr}
            numericValueKind="ratio"
            numericValueBaseline={1}
            helper="NOI / annual debt service"
            winner={metricModeLabel}
            layout={layout}
            inlineValueScale="large"
          />
        );
      case 'roi':
        return (
          <KpiCard
            label="ROI"
            value={percentFormatter.format(metricOutput.roi)}
            numericValue={metricOutput.roi}
            numericValueKind="percent"
            helper="Total profit / total cash invested"
            winner={metricModeLabel}
            layout={layout}
            inlineValueScale="large"
          />
        );
      case 'irr':
        return (
          <KpiCard
            label="IRR"
            value={percentFormatter.format(metricOutput.irr)}
            numericValue={metricOutput.irr}
            numericValueKind="percent"
            helper="Discounted return from yearly cashflow timeline"
            winner={metricModeLabel}
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
            layout={layout}
            inlineValueScale="large"
          />
        );
      default:
        return null;
    }
  };

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

  const activeStrategyLabel = activeModeLabel;
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
      summary: 'Variables'
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
  const isHeaderModalOpen = isStrategyWorkOpen || isDealIdentityOpen || isDesktopDealVaultOpen || isDealReviewOpen || compactSheetView !== null;
  const headerChromeMutedClass = isHeaderModalOpen
    ? 'pointer-events-none select-none blur-[6px] opacity-30 saturate-[0.7] transition duration-200 ease-out'
    : 'transition duration-200 ease-out';
  const syncFeedbackClassName = syncFeedback
    ? syncFeedback.tone === 'error'
      ? 'border-red-400/50 bg-red-500/15 text-red-100'
      : syncFeedback.tone === 'success'
        ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-100'
        : 'border-accent/45 bg-accent/12 text-slate-100'
    : '';
  const quickScanPoints = quickScanDetails[activeStrategy];
  const strategyQuickScan = isQuickScanVisible ? { title: activeStrategyLabel, points: quickScanPoints } : undefined;
  const orderedHeadlineMetricIds = normalizeHeadlineMetricOrder(headlineMetricOrder);
  const showTargetIrrInput =
    model.purchase.financingType === 'cash' &&
    ['purchase', 'longTerm', 'airbnb', 'padSplit', 'brrrr'].includes(activeStrategy);
  const hasMoreMetricsContent =
    Boolean(strategyQuickScan) ||
    showCommercialDigestSection ||
    showLongTermTurnaroundDigestSection;
  const isFlipStrategy = activeStrategy === 'flip';
  const activeHeadlineMetricIds = isFlipStrategy ? flipHeadlineMetricOrder : orderedHeadlineMetricIds;
  const supportsReserveToggle =
    activeStrategy === 'purchase' ||
    activeStrategy === 'longTerm' ||
    activeStrategy === 'airbnb' ||
    activeStrategy === 'padSplit' ||
    activeStrategy === 'brrrr';
  const includeReserves = includeReservesByStrategy[activeStrategy];
  const priorityMetricOutput = isLongTermTurnaroundActive ? longTermPurchaseOutput : activeOutput;
  const priorityMetricValue = isFlipStrategy
    ? activeOutput.calculationBreakdown?.flipMeta?.netProfit ?? activeOutput.saleProceeds ?? 0
    : supportsReserveToggle && !includeReserves
      ? priorityMetricOutput.monthlyCashFlowExcludingReserves ?? priorityMetricOutput.monthlyCashFlow
      : priorityMetricOutput.monthlyCashFlow;
  const priorityMetricTitle = isFlipStrategy ? 'Net profit' : 'Monthly cash flow';
  const priorityMetricSubtitle = isFlipStrategy
    ? 'Projected profit after cash invested, sale costs, debt payoff, and carry costs'
    : null;
  const priorityMetricNegativeStyle = getNegativeValueStyle(priorityMetricValue, { kind: 'currency' });
  const formattedPriorityMetricValue = currencyFormatter.format(priorityMetricValue);
  const priorityMetricMotionContext = `${activeModeLabel}:${priorityMetricTitle}`;
  const priorityMetricMotionSourceRef = useRef<{ context: string; value: number } | null>(null);
  const [priorityMetricMotion, setPriorityMetricMotion] = useState({ key: 0, context: '' });
  useEffect(() => {
    const previous = priorityMetricMotionSourceRef.current;

    if (previous) {
      if (previous.context === priorityMetricMotionContext && !Object.is(previous.value, priorityMetricValue)) {
        setPriorityMetricMotion((current) => ({
          key: current.key + 1,
          context: priorityMetricMotionContext
        }));
      } else if (previous.context !== priorityMetricMotionContext) {
        setPriorityMetricMotion((current) => (current.context ? { key: current.key, context: '' } : current));
      }
    }

    priorityMetricMotionSourceRef.current = {
      context: priorityMetricMotionContext,
      value: priorityMetricValue
    };
  }, [priorityMetricMotionContext, priorityMetricValue]);
  const shouldAnimatePriorityMetric =
    !prefersReducedMotion && priorityMetricMotion.key > 0 && priorityMetricMotion.context === priorityMetricMotionContext;
  const priorityMetricMotionClass = shouldAnimatePriorityMetric ? 'priority-kpi-value-motion' : '';
  const incompleteDecisionDescription = 'Add purchase price and expected income to evaluate this deal.';

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

  const signedInAvatarLabel = useMemo(() => {
    const email = currentUser?.email?.trim();
    return email ? `Signed in as ${email}` : 'Signed in';
  }, [currentUser]);
  const isAdminOwner = isOwnerEmail(currentUser?.email);

  const renderProfileAvatar = (options?: { sizeClassName?: string; textClassName?: string; label?: string }) => (
    <div
      className={`${options?.sizeClassName ?? 'h-8 w-8'} overflow-hidden rounded-full border border-white/20 bg-white/10`}
      aria-label={options?.label ?? 'Profile photo'}
    >
      {profileImageUrl ? (
        <img src={profileImageUrl} alt="Signed-in user profile photo" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <div className={`flex h-full w-full items-center justify-center font-semibold text-slate-100 ${options?.textClassName ?? 'text-[10px]'}`}>
          {profileFallbackLabel}
        </div>
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

    const rawTimeline = getAnnualOperatingCashFlows(priorityMetricOutput, model.assumptions.holdYears);

    if (rawTimeline.length > 0) {
      return rawTimeline.map((value) => {
        if (supportsReserveToggle && !includeReserves) {
          const reserveDelta =
            (priorityMetricOutput.monthlyCashFlowExcludingReserves ?? priorityMetricOutput.monthlyCashFlow) - priorityMetricOutput.monthlyCashFlow;
          return value + reserveDelta * 12;
        }
        return value;
      });
    }

    return Array.from({ length: 12 }, (_, index) => priorityMetricOutput.monthlyCashFlow * (0.82 + index * 0.03));
  }, [includeReserves, isFlipStrategy, model.assumptions.holdYears, priorityMetricOutput, supportsReserveToggle]);

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

  const loadScenario = (payload: DealInputModel, dealId?: string) => {
    const nextUiState = resolveDealUiState(payload);
    activeDealUiStatePresenceRef.current = {
      hasActiveStrategy: isStrategyKey(payload.uiState?.activeStrategy),
      hasProjectionStrategies: Array.isArray(payload.uiState?.projectionStrategies) && payload.uiState.projectionStrategies.length > 0
    };
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

  const setLongTermTurnaroundEnabled = (enabled: boolean) => {
    prepareDesktopDigestFlip();
    updateModel((current) => {
      if (current.longTerm.turnaround.enabled === enabled) return current;

      return {
        ...current,
        longTerm: {
          ...current.longTerm,
          turnaround: {
            ...current.longTerm.turnaround,
            enabled
          }
        }
      };
    });
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
    prepareDesktopDigestFlip();
    if (nextStrategy !== activeStrategy) {
      void trackAnalyticsEvent('strategy_selected', { strategy: nextStrategy });
    }
    setActiveStrategy(nextStrategy);
    setIsHeadlineMetricOrderEditorOpen(false);
    setIsCommercialOrderEditorOpen(false);
    setIsLongTermTurnaroundOrderEditorOpen(false);
    setShowAllCommercialMobileOutputs(false);
    setShowAllLongTermTurnaroundMobileOutputs(false);
  };

  const openDesktopStrategyWorkspace = (nextStrategy: StrategyKey) => {
    handleStrategyChange(nextStrategy);
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

  const isElementVisible = useCallback((element: HTMLElement | null) => {
    if (!element) return false;
    if (typeof window === 'undefined') return true;

    const styles = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return styles.display !== 'none' && styles.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }, []);

  const getFirstVisibleElement = useCallback((...elements: Array<HTMLElement | null>) => {
    return elements.find((element) => isElementVisible(element)) ?? elements.find(Boolean) ?? null;
  }, [isElementVisible]);

  const resolveOnboardingTarget = useCallback(() => {
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
    if (step.id === 'desktopDeals') return dealVaultRef.current;
    if (step.id === 'desktopStrategy') return desktopStrategyTabsRef.current;
    if (step.id === 'desktopCore') return desktopCoreSectionRef.current;
    if (step.id === 'desktopExpenses') return desktopExpensesSectionRef.current;
    if (step.id === 'desktopStrategyInputs') return desktopStrategyInputsRef.current;
    if (step.id === 'desktopIrr') {
      return getFirstVisibleElement(irrStreamRef.current?.querySelector<HTMLElement>('.dashboard-irr-tour-target') ?? null, irrStreamRef.current);
    }
    if (step.id === 'desktopResults') return desktopResultsSectionRef.current;
    if (step.id === 'desktopCompare') {
      return getFirstVisibleElement(desktopCompareSectionRef.current?.querySelector<HTMLElement>('.projection-card-glass') ?? null, desktopCompareSectionRef.current);
    }
    if (step.id === 'desktopActions') {
      return getFirstVisibleElement(desktopHeaderActionsRef.current, desktopAuthActionRef.current, desktopSettingsControlsRef.current);
    }
    return getFirstVisibleElement(compactTimelineButtonRef.current, irrStreamRef.current);
  }, [currentOnboardingSteps, getFirstVisibleElement, onboardingStepIndex]);

  const scrollOnboardingTargetIntoView = useCallback((getTarget: () => HTMLElement | null, block: ScrollLogicalPosition = 'center') => {
    if (typeof window === 'undefined') return () => {};

    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        getTarget()?.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block,
          inline: 'nearest'
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) {
        window.cancelAnimationFrame(secondFrame);
      }
    };
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
    const navigatorConnection =
      typeof navigator !== 'undefined' && 'connection' in navigator
        ? (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection
        : undefined;
    const details =
      error && typeof error === 'object'
        ? {
            status: (error as { status?: unknown }).status,
            name: error instanceof Error ? error.name : undefined,
            message: (error as { message?: unknown }).message,
            online: typeof navigator === 'undefined' ? undefined : navigator.onLine,
            connectionType: navigatorConnection?.effectiveType,
            connectionDownlink: navigatorConnection?.downlink,
            connectionRtt: navigatorConnection?.rtt
          }
        : {
            status: undefined,
            name: undefined,
            message: String(error),
            online: typeof navigator === 'undefined' ? undefined : navigator.onLine,
            connectionType: navigatorConnection?.effectiveType,
            connectionDownlink: navigatorConnection?.downlink,
            connectionRtt: navigatorConnection?.rtt
          };

    console.error(`Supabase scenarios ${operation} error:`, { details, error });
    reportClientError({
      source: 'cloud-scenarios',
      operation,
      severity: toClientErrorMessage(error).toLowerCase().includes('failed to fetch') ? 'warning' : 'error',
      message: `Supabase scenarios ${operation} failed: ${toClientErrorMessage(error)}`,
      stack: error instanceof Error ? error.stack : undefined,
      userId: currentUser?.id ?? null,
      metadata: details
    });
    setLastCloudError(operation);
    setCloudHealth('error');
    showSyncFeedback('Cloud sync needs attention. Your local Deal Vault backup is still available.', 'error');
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
        dealName: model.purchase.dealName,
        updatedAt: new Date().toISOString()
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
    const authMode = params.get('authMode');

    if (!authError && authMode !== 'password-reset') return;

    if (authMode === 'password-reset') {
      setEmailAuthMode('resetPassword');
      setIsAuthMenuOpen(true);
      if (window.innerWidth <= 1199) {
        setCompactSheetView('menu');
      }
      setAuthFeedback({ tone: 'success', message: 'Enter a new password to finish account recovery.' });
    }

    if (authError) {
      setAuthFeedback({ tone: 'error', message: authError });
      setIsAuthMenuOpen(true);
      if (window.innerWidth <= 1199) {
        setCompactSheetView('menu');
      }
    }

    params.delete('authMode');
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
    const handleWindowError = (event: ErrorEvent) => {
      reportClientError({
        source: 'window-error',
        severity: 'error',
        message: event.message || 'Unhandled window error',
        stack: event.error instanceof Error ? event.error.stack : undefined,
        userId: currentUser?.id ?? null,
        metadata: { filename: event.filename, lineno: event.lineno, colno: event.colno }
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      reportClientError({
        source: 'unhandled-rejection',
        operation: 'unhandledrejection',
        severity: 'error',
        message: toClientErrorMessage(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        userId: currentUser?.id ?? null,
        metadata: {
          reasonName: reason instanceof Error ? reason.name : undefined,
          online: typeof navigator === 'undefined' ? undefined : navigator.onLine
        }
      });
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [currentUser?.id]);

  const clearPendingCloudState = () => {
    if (pushTimerRef.current) {
      window.clearTimeout(pushTimerRef.current);
      pushTimerRef.current = null;
    }

    hasLoadedSupabaseDeals.current = false;
    queuedPushScenarioIdRef.current = null;
    pendingDeleteIdsRef.current.clear();
    pendingUpsertIdsRef.current.clear();
    setBaselineCompleteState(false);
    setBaselineUpsertsCount(0);
    setFetchedScenarioCount(0);
    setPrunedLocalCount(0);
    setLastCloudError(null);
    setCloudHealth('idle');
    setSyncFeedback(null);
  };

  const showBlankVaultState = () => {
    const payload = attachDealUiState(buildNewDealPayload('New Deal'), {
      activeStrategy: defaultNewDealStrategy,
      projectionStrategies: normalizeProjectionStrategySelection(defaultProjectionStrategies)
    });

    activeDealUiStatePresenceRef.current = { hasActiveStrategy: false, hasProjectionStrategies: false };
    setModel(payload);
    setActiveStrategy(defaultNewDealStrategy);
    setCompactSelectedStrategies(normalizeProjectionStrategySelection(defaultProjectionStrategies));
    setActiveDealId('');
    setSaveStatus('idle');
  };

  const loadVaultScope = (ownerId: string | null, options?: { createIfEmpty?: boolean }) => {
    setScenarioStorageOwner(ownerId);

    const scopedDeals = readDealsFromVault();
    const nextActiveDeal = scopedDeals[0] ?? null;
    if (nextActiveDeal) {
      setDeals(scopedDeals);
      loadScenario(nextActiveDeal.payload, nextActiveDeal.scenarioId);
      setSaveStatus('idle');
      return;
    }

    if (options?.createIfEmpty) {
      const payload = buildNewDealPayload('New Deal');
      const freshDeal = createDealInVault(payload, payload.purchase.dealName);
      const nextDeals = saveDealToVault(freshDeal);

      setDeals(nextDeals);
      loadScenario(freshDeal.payload, freshDeal.scenarioId);
      setSaveStatus('idle');
      return;
    }

    setDeals(scopedDeals);
    showBlankVaultState();
  };

  const applyAuthUser = (nextUser: User | null) => {
    const nextOwnerId = nextUser?.id ?? null;

    if (activeVaultOwnerIdRef.current !== nextOwnerId) {
      clearPendingCloudState();
      activeVaultOwnerIdRef.current = nextOwnerId;
      loadVaultScope(nextOwnerId, { createIfEmpty: nextOwnerId === null });
    }

    setCurrentUser(nextUser);
    if (!nextUser) {
      setIsAuthMenuOpen(false);
    }
  };

  useEffect(() => {
    if (hasHydratedLocalVaultRef.current) return;

    hasHydratedLocalVaultRef.current = true;
    loadVaultScope(null, { createIfEmpty: true });
    // Run once after hydration so the first client render stays identical to SSR.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setHasResolvedInitialAuth(true);
      return;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      applyAuthUser(data.session?.user ?? null);
      setHasResolvedInitialAuth(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      applyAuthUser(session?.user ?? null);
      if (!session?.user) {
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
    setIsClientMounted(true);
  }, []);

  useEffect(() => {
    if (!isClientMounted || appOpenTrackedRef.current) return;

    appOpenTrackedRef.current = true;
    const attribution = getMarketingAttributionFromSearch(window.location.search);
    const hasSharedDeal = new URLSearchParams(window.location.search).has('s');
    const landingStrategy = attribution.strategy;
    if (landingStrategy && !hasSharedDeal) {
      activeDealUiStatePresenceRef.current = { hasActiveStrategy: true, hasProjectionStrategies: true };
      setActiveStrategy(landingStrategy);
      setCompactSelectedStrategies([landingStrategy]);
      setModel((current) => ({
        ...current,
        uiState: { activeStrategy: landingStrategy, projectionStrategies: [landingStrategy] }
      }));
    }
    if (attribution.source) void trackAnalyticsEvent('marketing_entry', attribution);
    void trackAnalyticsEvent('app_opened', {
      signedIn: Boolean(currentUser?.id),
      pwaInstalled: isPwaInstalled,
      ...attribution
    });
    const cleanedUrl = removeMarketingParamsFromUrl(window.location.href);
    if (cleanedUrl !== window.location.href) window.history.replaceState(window.history.state, '', cleanedUrl);
  }, [currentUser?.id, isClientMounted, isPwaInstalled]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (typeof window.matchMedia === 'function') {
      const mediaQuery = window.matchMedia('(max-width: 1199px)');
      const updateViewport = () => {
        setIsMobileViewport(mediaQuery.matches);
        setFeedbackViewport(mediaQuery.matches ? 'mobile' : 'desktop');
      };

      updateViewport();
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', updateViewport);
        return () => mediaQuery.removeEventListener('change', updateViewport);
      }

      mediaQuery.addListener(updateViewport);
      return () => mediaQuery.removeListener(updateViewport);
    }

    const updateViewport = () => {
      const isMobile = window.innerWidth <= 1199;
      setIsMobileViewport(isMobile);
      setFeedbackViewport(isMobile ? 'mobile' : 'desktop');
    };
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
    if (!feedbackViewport || feedbackOpenCountedRef.current || typeof window === 'undefined') return;
    if (!currentUser?.id || isOnboardingOpen) return;

    const hasSeenTutorial = window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1';
    if (!hasSeenTutorial) return;

    feedbackOpenCountedRef.current = true;

    const openCountKey = getViewportStorageKey(FEEDBACK_OPEN_COUNT_STORAGE_KEY, feedbackViewport);
    const nextOpenCount = readStoredCount(openCountKey) + 1;
    window.localStorage.setItem(openCountKey, String(nextOpenCount));

    const hasSentFeedback = window.localStorage.getItem(FEEDBACK_SENT_STORAGE_KEY) === '1';
    const lastSentOpenCount = readStoredCount(getViewportStorageKey(FEEDBACK_LAST_SENT_OPEN_COUNT_STORAGE_KEY, feedbackViewport));
    const opensSinceFeedback = nextOpenCount - lastSentOpenCount;
    const shouldPrompt = hasSentFeedback
      ? opensSinceFeedback > 0 && opensSinceFeedback % 7 === 0
      : nextOpenCount % 2 === 0;

    let promptTimer: number | null = null;
    if (shouldPrompt) {
      promptTimer = window.setTimeout(() => {
        setFeedbackSource('reminder');
        setIsFeedbackPromptOpen(true);
      }, FEEDBACK_PROMPT_DELAY_MS);
    }

    return () => {
      if (promptTimer !== null) {
        window.clearTimeout(promptTimer);
      }
    };
  }, [currentUser?.id, feedbackViewport, isOnboardingOpen]);

  useEffect(() => {
    if (!isOnboardingOpen) return;

    const step = currentOnboardingSteps[onboardingStepIndex];
    if (!step) return;

    if (step.id === 'desktopDeals') {
      setWorkspaceViewMode('studio');
      setDesktopWorkspaceMode('build');
      setDesktopInputSection('core');
      return scrollOnboardingTargetIntoView(() => resolveOnboardingTarget(), 'center');
    }

    if (step.id === 'desktopStrategy') {
      setWorkspaceViewMode('studio');
      setDesktopWorkspaceMode('build');
      return scrollOnboardingTargetIntoView(() => resolveOnboardingTarget(), 'center');
    }

    if (step.id === 'desktopCore') {
      setWorkspaceViewMode('studio');
      setDesktopWorkspaceMode('build');
      setDesktopInputSection('core');
      return scrollOnboardingTargetIntoView(() => resolveOnboardingTarget(), 'nearest');
    }

    if (step.id === 'desktopExpenses') {
      setWorkspaceViewMode('studio');
      setDesktopWorkspaceMode('build');
      setDesktopInputSection('expenses');
      return scrollOnboardingTargetIntoView(() => resolveOnboardingTarget(), 'nearest');
    }

    if (step.id === 'desktopStrategyInputs') {
      setWorkspaceViewMode('studio');
      setDesktopWorkspaceMode('build');
      setDesktopInputSection('strategy');
      return scrollOnboardingTargetIntoView(() => resolveOnboardingTarget(), 'nearest');
    }

    if (step.id === 'desktopIrr') {
      setWorkspaceViewMode('studio');
      setDesktopWorkspaceMode('build');
      setDesktopInputSection('irr');
      return scrollOnboardingTargetIntoView(() => resolveOnboardingTarget(), 'nearest');
    }

    if (step.id === 'desktopResults') {
      setWorkspaceViewMode('studio');
      return scrollOnboardingTargetIntoView(() => desktopResultsSectionRef.current, 'center');
    }

    if (step.id === 'desktopCompare') {
      setWorkspaceViewMode('studio');
      setDesktopWorkspaceMode('compare');
      return scrollOnboardingTargetIntoView(() => desktopCompareSectionRef.current, 'nearest');
    }

    if (step.id === 'desktopActions') {
      setWorkspaceViewMode('studio');
      setIsAuthMenuOpen(false);
      setIsSettingsOpen(false);
      return scrollOnboardingTargetIntoView(() => desktopHeaderActionsRef.current, 'center');
    }

    if (step.id === 'mobileDeals') {
      setWorkspaceViewMode('studio');
      setCompactMode('inputs');
      setCompactSheetView(null);
      return scrollOnboardingTargetIntoView(() => compactDealsButtonRef.current, 'center');
    }

    if (step.id === 'mobileStrategy') {
      setWorkspaceViewMode('studio');
      setCompactMode('inputs');
      setCompactSheetView(null);
      setCompactInputSection('strategy');
      return scrollOnboardingTargetIntoView(() => compactStrategyButtonRef.current, 'center');
    }

    if (step.id === 'mobileCore') {
      setWorkspaceViewMode('studio');
      setCompactMode('inputs');
      setCompactSheetView(null);
      setCompactInputSection('core');
      return scrollOnboardingTargetIntoView(() => compactCoreInputButtonRef.current, 'nearest');
    }

    if (step.id === 'mobileExpenses') {
      setWorkspaceViewMode('studio');
      setCompactMode('inputs');
      setCompactSheetView(null);
      setCompactInputSection('expenses');
      return scrollOnboardingTargetIntoView(() => compactExpensesInputButtonRef.current, 'nearest');
    }

    if (step.id === 'mobileStrategyInputs') {
      setWorkspaceViewMode('studio');
      setCompactMode('inputs');
      setCompactSheetView(null);
      setCompactInputSection('strategy');
      return scrollOnboardingTargetIntoView(() => compactStrategyInputButtonRef.current, 'nearest');
    }

    if (step.id === 'mobileIrr') {
      setWorkspaceViewMode('studio');
      setCompactMode('inputs');
      setCompactSheetView(null);
      setCompactInputSection('irr');
      return scrollOnboardingTargetIntoView(() => compactIrrInputButtonRef.current, 'nearest');
    }

    if (step.id === 'mobileResults') {
      setWorkspaceViewMode('studio');
      setCompactMode('results');
      setCompactSheetView(null);
      return scrollOnboardingTargetIntoView(() => compactResultsNavButtonRef.current, 'nearest');
    }

    if (step.id === 'mobileCompare') {
      setWorkspaceViewMode('studio');
      setCompactMode('compare');
      setCompactSheetView(null);
      return scrollOnboardingTargetIntoView(() => compactCompareNavButtonRef.current, 'nearest');
    }
    if (step.id === 'mobileActions') {
      setWorkspaceViewMode('studio');
      setCompactSheetView(null);
      return scrollOnboardingTargetIntoView(() => compactMenuButtonRef.current, 'center');
    }
  }, [
    currentOnboardingSteps,
    isMobileViewport,
    isOnboardingOpen,
    onboardingStepIndex,
    prefersReducedMotion,
    resolveOnboardingTarget,
    scrollOnboardingTargetIntoView
  ]);

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
      if (!activeDealUiStatePresenceRef.current.hasActiveStrategy) {
        setActiveStrategy(storedDefaultStrategy);
      }
    }

    const storedDefaultProjectionStrategies = window.localStorage.getItem(SETTINGS_DEFAULT_PROJECTION_STRATEGIES_STORAGE_KEY);
    if (storedDefaultProjectionStrategies) {
      try {
        const parsedProjectionStrategies = JSON.parse(storedDefaultProjectionStrategies);
        const normalizedProjectionStrategies = normalizeProjectionStrategySelection(parsedProjectionStrategies);
        setDefaultProjectionStrategies(normalizedProjectionStrategies);
        if (!activeDealUiStatePresenceRef.current.hasProjectionStrategies) {
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

    setWorkspaceViewMode(normalizeWorkspaceViewMode(window.localStorage.getItem(SETTINGS_WORKSPACE_VIEW_STORAGE_KEY)));
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
    if (typeof document === 'undefined') return;

    document.body.classList.toggle('theme-light', isLightMode);
    return () => document.body.classList.remove('theme-light');
  }, [isLightMode]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SETTINGS_QUICK_SCAN_VISIBLE_STORAGE_KEY, isQuickScanVisible ? '1' : '0');
  }, [isQuickScanVisible]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SETTINGS_WORKSPACE_VIEW_STORAGE_KEY, workspaceViewMode);
  }, [workspaceViewMode]);
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
    if (!guardNewSavedDeals()) return;

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
    void trackAnalyticsEvent('scenario_created', { source: 'save_as', signedIn: Boolean(currentUser?.id) });
  };

  const createNewDeal = (
    requestedDealName: string,
    listingUrl: string,
    options?: { openIdentityEditor?: boolean; preserveBlankIdentity?: boolean }
  ) => {
    if (!guardNewSavedDeals()) return null;

    const shouldPreserveBlankIdentity = options?.preserveBlankIdentity && requestedDealName.trim().length === 0 && listingUrl.trim().length === 0;
    const candidateName = shouldPreserveBlankIdentity ? '' : buildUniqueDealName(requestedDealName);
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
    void trackAnalyticsEvent('scenario_created', { source: 'new_deal', signedIn: Boolean(currentUser?.id) });
    if (options?.openIdentityEditor) {
      setIsDealIdentityOpen(true);
    }

    return nextDeal;
  };

  const loadSampleDeal = () => {
    if (!guardNewSavedDeals()) return null;

    const sampleDealName = buildUniqueDealName(SAMPLE_DEAL_NAME);
    const samplePayload = buildSampleDealPayload();
    const nextProjectionStrategies = normalizeProjectionStrategySelection(defaultProjectionStrategies);
    const payload = attachDealUiState(
      {
        ...samplePayload,
        purchase: {
          ...samplePayload.purchase,
          dealName: sampleDealName
        }
      },
      {
        activeStrategy: 'longTerm',
        projectionStrategies: nextProjectionStrategies
      }
    );

    const sampleDeal = createDealInVault(payload, sampleDealName);
    const nextDeals = saveDealToVault(sampleDeal);
    setDeals(nextDeals);
    loadScenario(sampleDeal.payload, sampleDeal.scenarioId);
    queueScenarioPush(sampleDeal);
    setSaveStatus('saved');
    setIsSettingsOpen(false);
    setCompactSheetView(null);
    showSyncFeedback('Sample deal loaded. Edit the assumptions or duplicate it before using real numbers.', 'success');
    qualifyInstallPrompt();
    void trackAnalyticsEvent('scenario_created', { source: 'sample_deal', signedIn: Boolean(currentUser?.id) });
    void trackAnalyticsEvent('scenario_sample_loaded', { signedIn: Boolean(currentUser?.id) });

    return sampleDeal;
  };

  const duplicateScenario = (scenarioId: string) => {
    if (!guardNewSavedDeals()) return;

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
    void trackAnalyticsEvent('scenario_created', { source: 'duplicate', signedIn: Boolean(currentUser?.id) });
    void trackAnalyticsEvent('scenario_duplicated', { signedIn: Boolean(currentUser?.id) });
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
    setIsDesktopDealVaultOpen(false);
    setIsDealIdentityOpen(true);
  };

  const openDesktopDealVault = () => {
    triggerHapticFeedback('light');
    setCompactSheetView(null);
    setIsAuthMenuOpen(false);
    setIsSettingsOpen(false);
    setIsDealIdentityOpen(false);
    setIsDesktopDealVaultOpen(true);
  };

  const launchNewDeal = () => {
    triggerHapticFeedback('light');
    setCompactSheetView(null);
    setIsAuthMenuOpen(false);
    setIsSettingsOpen(false);
    setIsDesktopDealVaultOpen(false);
    const nextDeal = createNewDeal('', '', { openIdentityEditor: true, preserveBlankIdentity: true });
    if (!nextDeal) return;
    pendingNewDealDraftRef.current = {
      initialDealName: nextDeal.dealName,
      previousDealId: activeDealId,
      scenarioId: nextDeal.scenarioId
    };
    setCompactMode('inputs');
  };

  const closeDealIdentityEditor = () => {
    const pendingDraft = pendingNewDealDraftRef.current;
    const isUntouchedDraft =
      pendingDraft &&
      activeDealId === pendingDraft.scenarioId &&
      (model.purchase.dealName.trim().length === 0 || model.purchase.dealName.trim() === pendingDraft.initialDealName) &&
      model.purchase.listingUrl.trim().length === 0;

    if (isUntouchedDraft) {
      pendingUpsertIdsRef.current.delete(pendingDraft.scenarioId);
      pendingDeleteIdsRef.current.add(pendingDraft.scenarioId);

      if (pushTimerRef.current && queuedPushScenarioIdRef.current === pendingDraft.scenarioId) {
        window.clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
        queuedPushScenarioIdRef.current = null;
      }

      const nextDeals = removeDealFromVault(pendingDraft.scenarioId);
      setDeals(nextDeals);

      const previousDeal = nextDeals.find((deal) => deal.scenarioId === pendingDraft.previousDealId) ?? nextDeals[0] ?? null;
      if (previousDeal) {
        loadScenario(previousDeal.payload, previousDeal.scenarioId);
      } else {
        setActiveDealId('');
      }

      setSaveStatus('idle');
      void (async () => {
        const ok = await syncScenarioDelete(pendingDraft.scenarioId);
        if (ok) {
          pendingDeleteIdsRef.current.delete(pendingDraft.scenarioId);
          return;
        }

        if (process.env.NODE_ENV !== 'production') {
          console.info('[DealVault Debug]', { mode: 'pending-delete-retained', scenarioId: pendingDraft.scenarioId });
        }
      })();
    }

    pendingNewDealDraftRef.current = null;
    setIsDealIdentityOpen(false);
  };

  const openRecentScenario = (scenarioId: string) => {
    const scenario = deals.find((entry) => entry.scenarioId === scenarioId);
    if (!scenario) return;
    loadScenario(scenario.payload, scenario.scenarioId);
  };

  const openDesktopVaultScenario = (scenarioId: string) => {
    openRecentScenario(scenarioId);
    setIsDesktopDealVaultOpen(false);
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
      void trackAnalyticsEvent('scenario_created', { source: 'delete_replacement', signedIn: Boolean(currentUser?.id) });
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
    void trackAnalyticsEvent('scenario_deleted', { signedIn: Boolean(currentUser?.id) });

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

  const showShareFeedback = (
    anchor: ShareFeedbackAnchor,
    feedback: Omit<ShareFeedbackState, 'anchor'>
  ) => setShareFeedback({ ...feedback, anchor });

  const shareCurrentDeal = async (anchor: ShareFeedbackAnchor = 'desktop-share') => {
    if (currentUser?.id) {
      const { slug, error } = await createShortShareLink({
        ownerId: currentUser.id,
        scenarioId: activeDealId || undefined,
        payloadSnapshot: attachDealUiState(model)
      });

      if (!error && slug) {
        const shortUrl = `${window.location.origin}/s/${slug}`;
        void trackAnalyticsEvent('share_link_created', { source: 'short_link', anchor, signedIn: true });
        try {
          await navigator.clipboard.writeText(shortUrl);
          triggerHapticFeedback('success');
          showShareFeedback(anchor, { tone: 'success', message: 'Link copied.' });
          qualifyInstallPrompt();
          return;
        } catch {
          showShareFeedback(anchor, { tone: 'error', message: 'Copy failed. Use this link manually.', fallbackUrl: shortUrl });
          return;
        }
      }

      console.error('Supabase share create error:', error);
      showShareFeedback(anchor, { tone: 'error', message: 'Unable to create short share link right now.' });
      return;
    }

    const encoded = encodeDealToShareParam(attachDealUiState(model));
    if (!encoded) {
      showShareFeedback(anchor, { tone: 'error', message: 'Unable to generate a share link for this deal.' });
      return;
    }

    const url = `${window.location.origin}${window.location.pathname}?s=${encoded}`;
    void trackAnalyticsEvent('share_link_created', { source: 'url_param', anchor, signedIn: false });

    try {
      await navigator.clipboard.writeText(url);
      triggerHapticFeedback('success');
      showShareFeedback(anchor, { tone: 'success', message: 'Link copied.' });
      qualifyInstallPrompt();
    } catch {
      triggerHapticFeedback('medium');
      showShareFeedback(anchor, { tone: 'error', message: 'Copy failed. Use this link manually.', fallbackUrl: url });
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
        redirectTo: getAuthCallbackUrl()
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

    const email = authEmail.trim();

    if (!email || !authPassword.trim()) {
      setAuthFeedback({ tone: 'error', message: 'Enter both email and password to create an account.' });
      return;
    }

    if (authPassword.length < 6) {
      setAuthFeedback({ tone: 'error', message: 'Use a password with at least 6 characters.' });
      return;
    }

    setAuthBusy(true);
    setAuthFeedback(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password: authPassword,
      options: {
        emailRedirectTo: getAuthCallbackUrl()
      }
    });
    setAuthBusy(false);

    if (error) {
      setAuthFeedback({ tone: 'error', message: error.message });
      return;
    }

    setAuthPassword('');

    const signedInUser = data.session?.user ?? null;
    if (signedInUser) {
      applyAuthUser(signedInUser);
      setIsAuthMenuOpen(false);
      setAuthFeedback({ tone: 'success', message: 'Account created. Your deals will sync automatically.' });
      return;
    }

    setEmailAuthMode('signIn');
    setAuthFeedback({ tone: 'success', message: 'Account created. Check your email, then sign in here.' });
  };

  const signInWithEmail = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const email = authEmail.trim();

    if (!email || !authPassword.trim()) {
      setAuthFeedback({ tone: 'error', message: 'Enter your email and password to sign in.' });
      return;
    }

    setAuthBusy(true);
    setAuthFeedback(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: authPassword
    });
    setAuthBusy(false);

    if (error) {
      setAuthFeedback({ tone: 'error', message: error.message });
      return;
    }

    const signedInUser = data.session?.user ?? data.user ?? null;
    if (signedInUser) {
      applyAuthUser(signedInUser);
      setIsAuthMenuOpen(false);
    }

    setAuthPassword('');
    setAuthFeedback({ tone: 'success', message: 'Signed in. Your deals will sync automatically.' });
  };

  const sendPasswordResetEmail = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const email = authEmail.trim();
    if (!email) {
      setAuthFeedback({ tone: 'error', message: 'Enter your email address first.' });
      return;
    }

    setAuthBusy(true);
    setAuthFeedback(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthCallbackUrl('password-reset')
    });
    setAuthBusy(false);

    if (error) {
      reportClientError({
        source: 'auth',
        operation: 'password-reset-email',
        severity: 'warning',
        message: error.message,
        metadata: { status: (error as { status?: unknown }).status }
      });
      setAuthFeedback({ tone: 'error', message: error.message });
      return;
    }

    setAuthFeedback({ tone: 'success', message: 'Password reset email sent. Check your inbox, then return here.' });
  };

  const updateRecoveredPassword = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    if (!resetPasswordValue || !resetPasswordConfirmValue) {
      setAuthFeedback({ tone: 'error', message: 'Enter and confirm your new password.' });
      return;
    }

    if (resetPasswordValue.length < 6) {
      setAuthFeedback({ tone: 'error', message: 'Use a password with at least 6 characters.' });
      return;
    }

    if (resetPasswordValue !== resetPasswordConfirmValue) {
      setAuthFeedback({ tone: 'error', message: 'Passwords do not match.' });
      return;
    }

    setAuthBusy(true);
    setAuthFeedback(null);

    const { error } = await supabase.auth.updateUser({ password: resetPasswordValue });
    setAuthBusy(false);

    if (error) {
      reportClientError({
        source: 'auth',
        operation: 'password-update',
        severity: 'warning',
        message: error.message,
        userId: currentUser?.id ?? null,
        metadata: { status: (error as { status?: unknown }).status }
      });
      setAuthFeedback({ tone: 'error', message: error.message });
      return;
    }

    setResetPasswordValue('');
    setResetPasswordConfirmValue('');
    setAuthPassword('');
    setEmailAuthMode('signIn');
    setIsAuthMenuOpen(false);
    setAuthFeedback({ tone: 'success', message: 'Password updated. You can keep working securely.' });
  };

  const submitEmailAuth = () => {
    if (emailAuthMode === 'resetPassword') {
      void updateRecoveredPassword();
      return;
    }

    if (emailAuthMode === 'signIn') {
      void signInWithEmail();
      return;
    }

    void createAccountWithEmail();
  };

  const signOut = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setAuthBusy(true);
    const { error } = await supabase.auth.signOut();
    setAuthBusy(false);

    if (error) {
      setAuthFeedback({ tone: 'error', message: error.message });
      return;
    }

    applyAuthUser(null);
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
    setWorkspaceViewMode('studio');
  };

  const openInstallPromptFromSettings = () => {
    if (typeof window === 'undefined') return;
    if (!isMobileViewport) return;
    triggerHapticFeedback('light');
    setIsSettingsOpen(false);
    void trackAnalyticsEvent('pwa_install_prompt_requested', { source: 'settings' });
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

    if (mergedDeals.length === 0) {
      const payload = attachDealUiState(buildNewDealPayload('New Deal'), {
        activeStrategy: defaultNewDealStrategy,
        projectionStrategies: normalizeProjectionStrategySelection(defaultProjectionStrategies)
      });
      const freshDeal = createDealInVault(payload, payload.purchase.dealName);

      pendingUpsertIdsRef.current.add(freshDeal.scenarioId);
      const ok = await syncScenarioUpsert(freshDeal);
      if (ok) {
        baselineUpserts += 1;
      } else {
        upsertError = true;
      }

      mergedDeals = [freshDeal];
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
    if (!upsertError) {
      setCloudHealth('ok');
    }

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

  const retryCloudSync = async () => {
    if (!currentUser?.id) {
      showSyncFeedback('Sign in to sync Deal Vault with the cloud.', 'info');
      return;
    }

    setIsRetryingCloudSync(true);
    showSyncFeedback('Retrying cloud sync...', 'info');

    try {
      await pullAndMergeCloudDeals();
      showSyncFeedback('Cloud sync retry finished.', 'success');
    } catch (error) {
      reportClientError({
        source: 'cloud-scenarios',
        operation: 'manual-retry',
        severity: 'error',
        message: toClientErrorMessage(error),
        userId: currentUser.id
      });
      showSyncFeedback('Cloud sync retry failed. Export a backup before continuing.', 'error');
    } finally {
      setIsRetryingCloudSync(false);
    }
  };

  const exportDealVaultBackup = () => {
    if (typeof window === 'undefined') return;

    try {
      const records = readDealsFromVault();
      const backup = {
        exportedAt: new Date().toISOString(),
        ownerId: currentUser?.id ?? null,
        ownerEmail: currentUser?.email ?? null,
        app: 'DealCooker',
        schemaVersion: '1.0.0',
        deals: records
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dealcooker-vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showSyncFeedback(`Exported ${records.length} saved ${records.length === 1 ? 'deal' : 'deals'} from this vault.`, 'success');
    } catch (error) {
      reportClientError({
        source: 'deal-vault',
        operation: 'backup-export',
        severity: 'error',
        message: toClientErrorMessage(error),
        userId: currentUser?.id ?? null
      });
      showSyncFeedback('Unable to export Deal Vault backup from this browser.', 'error');
    }
  };

  const importDealVaultBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const rawText = typeof file.text === 'function'
        ? await file.text()
        : await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener('load', () => resolve(typeof reader.result === 'string' ? reader.result : ''));
            reader.addEventListener('error', () => reject(reader.error ?? new Error('Unable to read backup file.')));
            reader.readAsText(file);
          });
      const parsed = JSON.parse(rawText) as { deals?: unknown };
      const importedDeals = Array.isArray(parsed.deals)
        ? parsed.deals.filter((record): record is ScenarioRecord => {
            if (!record || typeof record !== 'object') return false;
            const candidate = record as Partial<ScenarioRecord>;
            return (
              typeof candidate.scenarioId === 'string' &&
              typeof candidate.dealName === 'string' &&
              typeof candidate.createdAt === 'string' &&
              typeof candidate.updatedAt === 'string' &&
              Boolean(candidate.payload && typeof candidate.payload === 'object')
            );
          })
        : [];

      if (importedDeals.length === 0) {
        showSyncFeedback('No DealCooker deals were found in that backup file.', 'error');
        return;
      }

      const currentDeals = readDealsFromVault();
      const currentDealIds = new Set(currentDeals.map((deal) => deal.scenarioId));
      const additionalDealCount = importedDeals.filter((deal) => !currentDealIds.has(deal.scenarioId)).length;

      if (!guardNewSavedDeals(additionalDealCount, currentDeals.length)) return;

      const mergedDeals = mergeScenariosByLatest(currentDeals, importedDeals);
      writeScenarios(mergedDeals);
      setDeals(mergedDeals);

      const nextActiveDeal = importedDeals[0] ?? mergedDeals[0];
      if (nextActiveDeal) {
        loadScenario(nextActiveDeal.payload, nextActiveDeal.scenarioId);
      }

      if (currentUser?.id) {
        importedDeals.forEach((deal) => {
          pendingUpsertIdsRef.current.add(deal.scenarioId);
          void syncScenarioUpsert(deal);
        });
      }

      showSyncFeedback(`Imported ${importedDeals.length} saved ${importedDeals.length === 1 ? 'deal' : 'deals'} into this vault.`, 'success');
    } catch (error) {
      reportClientError({
        source: 'deal-vault',
        operation: 'backup-import',
        severity: 'error',
        message: toClientErrorMessage(error),
        userId: currentUser?.id ?? null
      });
      showSyncFeedback('Unable to import that Deal Vault backup.', 'error');
    }
  };

  const markFeedbackSubmitted = (viewport: FeedbackViewport) => {
    if (typeof window === 'undefined') return;

    window.localStorage.setItem(FEEDBACK_SENT_STORAGE_KEY, '1');
    window.localStorage.setItem(
      getViewportStorageKey(FEEDBACK_LAST_SENT_OPEN_COUNT_STORAGE_KEY, viewport),
      String(readStoredCount(getViewportStorageKey(FEEDBACK_OPEN_COUNT_STORAGE_KEY, viewport)))
    );
  };

  const openFeedbackComposer = (source: FeedbackSource) => {
    setFeedbackSource(source);
    setFeedbackDraft('');
    setFeedbackSubmitState('idle');
    setFeedbackSubmitMessage(null);
    setIsFeedbackPromptOpen(false);
    setIsSettingsOpen(false);
    setCompactSheetView(null);
    setIsFeedbackComposerOpen(true);
    triggerHapticFeedback('light');
  };

  const openDealReviewRequest = (source: DealReviewSource = 'desktop_header') => {
    const contact = getFeedbackContactFromUser(currentUser);
    setDealReviewName(contact.name);
    setDealReviewEmail(contact.email);
    setDealReviewPhone(contact.phone);
    setDealReviewMarket('');
    setDealReviewFocus(dealReviewFocusOptions[0]);
    setDealReviewNotes('');
    setDealReviewConsent(false);
    setDealReviewSource(source);
    setDealReviewSubmitState('idle');
    setDealReviewSubmitMessage(null);
    setIsAuthMenuOpen(false);
    setIsSettingsOpen(false);
    setCompactSheetView(null);
    setIsDealReviewOpen(true);
    triggerHapticFeedback('light');
  };

  const closeDealReviewRequest = () => {
    if (dealReviewSubmitState === 'sending') return;
    setIsDealReviewOpen(false);
  };

  const submitDealReviewRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!DEAL_REVIEW_SUBMISSIONS_ENABLED) {
      setDealReviewSubmitState('idle');
      setDealReviewSubmitMessage('Paid deal analysis is coming soon. Submissions are temporarily disabled.');
      return;
    }

    if (dealReviewSubmitState === 'sending') return;

    const email = dealReviewEmail.trim();
    const name = dealReviewName.trim();
    const phone = dealReviewPhone.trim();
    const market = dealReviewMarket.trim();
    const notes = dealReviewNotes.trim();

    if (!email || !emailPattern.test(email)) {
      setDealReviewSubmitState('error');
      setDealReviewSubmitMessage('Add a valid email so the reviewer can follow up.');
      return;
    }

    if (!dealReviewConsent) {
      setDealReviewSubmitState('error');
      setDealReviewSubmitMessage('Confirm that this deal and your contact details can be shared for review.');
      return;
    }

    setDealReviewSubmitState('sending');
    setDealReviewSubmitMessage(null);

    try {
      const route = typeof window === 'undefined' ? appUrl : `${window.location.origin}${window.location.pathname}`;
      const response = await fetch('/api/deal-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: {
            name,
            email,
            phone
          },
          request: {
            market,
            reviewFocus: dealReviewFocus,
            notes,
            consentAccepted: dealReviewConsent
          },
          deal: {
            dealName: activeDealDisplayName,
            listingUrl: model.purchase.listingUrl ? normalizeListingUrl(model.purchase.listingUrl) : '',
            activeStrategy,
            activeStrategyLabel,
            purchase: {
              purchasePrice: model.purchase.purchasePrice,
              rehabBudget: model.purchase.rehabBudget,
              arv: model.purchase.arv
            },
            result: {
              monthlyCashFlow: activeOutput.monthlyCashFlow,
              totalCashNeeded: activeOutput.totalCashNeeded,
              cashOnCashReturn: activeOutput.cashOnCashReturn,
              roi: activeOutput.roi,
              irr: activeOutput.irr,
              dscr: activeOutput.dscr
            },
            snapshot: attachDealUiState(model)
          },
          context: {
            source: dealReviewSource,
            route,
            appRelease: appReleaseLabel,
            userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
            signedIn: Boolean(currentUser),
            userId: currentUser?.id ?? null,
            activeDeal: activeDealDisplayName,
            activeDealId: activeDealId || null,
            activeStrategy,
            projectionStrategies: compactSelectedStrategies,
            savedDealCount: deals.length
          }
        })
      });

      if (!response.ok) {
        throw new Error(await getFeedbackSubmitErrorMessage(response));
      }

      setDealReviewSubmitState('sent');
      setDealReviewSubmitMessage('Deal review request sent.');
      triggerHapticFeedback('light');
      void trackAnalyticsEvent('deal_review_requested', {
        source: dealReviewSource,
        activeStrategy,
        signedIn: Boolean(currentUser?.id),
        hasListingUrl: Boolean(model.purchase.listingUrl)
      });
    } catch (error) {
      reportClientError({
        source: 'deal-review',
        operation: 'submit',
        severity: 'error',
        message: toClientErrorMessage(error),
        userId: currentUser?.id ?? null
      });
      setDealReviewSubmitState('error');
      setDealReviewSubmitMessage(toClientErrorMessage(error) || 'Deal review request could not be sent. Try again in a moment.');
    }
  };

  const submitFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (feedbackSubmitState === 'sending' || feedbackSubmitState === 'sent') return;

    const message = feedbackDraft.trim();
    const contact = getFeedbackContactFromUser(currentUser);

    if (!message) {
      setFeedbackSubmitState('error');
      setFeedbackSubmitMessage('Add a note before sending feedback.');
      return;
    }

    if (!contact.email) {
      setFeedbackSubmitState('error');
      setFeedbackSubmitMessage('Sign in before sending feedback so I know who it came from.');
      return;
    }

    setFeedbackSubmitState('sending');
    setFeedbackSubmitMessage(null);

    try {
      const viewport = feedbackViewport ?? (isMobileViewport ? 'mobile' : 'desktop');
      const route = typeof window === 'undefined' ? appUrl : `${window.location.origin}${window.location.pathname}`;
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          contact: {
            name: contact.name,
            email: contact.email,
            phone: contact.phone
          },
          context: {
            source: feedbackSource,
            viewport,
            route,
            appRelease: appReleaseLabel,
            userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
            signedIn: Boolean(currentUser),
            userId: currentUser?.id ?? null,
            activeDeal: activeDealDisplayName,
            activeDealId: activeDealId || null,
            activeStrategy,
            projectionStrategies: compactSelectedStrategies,
            savedDealCount: deals.length
          }
        })
      });

      if (!response.ok) {
        throw new Error(await getFeedbackSubmitErrorMessage(response));
      }

      markFeedbackSubmitted(viewport);
      setFeedbackSubmitState('sent');
      setFeedbackSubmitMessage('Feedback sent. Thank you.');
      triggerHapticFeedback('light');
      void trackAnalyticsEvent('feedback_sent', { source: feedbackSource, viewport, signedIn: Boolean(currentUser?.id) });
    } catch (error) {
      reportClientError({
        source: 'feedback',
        operation: 'submit',
        severity: 'error',
        message: toClientErrorMessage(error),
        userId: currentUser?.id ?? null
      });
      setFeedbackSubmitState('error');
      setFeedbackSubmitMessage(toClientErrorMessage(error) || 'Feedback could not be sent. Try again in a moment.');
    }
  };

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
    if (!hasResolvedInitialAuth) return;

    const params = new URLSearchParams(window.location.search);
    const sharedToken = params.get('s');
    if (!sharedToken) return;

    const parsed = decodeDealFromShareParam(sharedToken);
    const syncImportTimer = window.setTimeout(() => {
      if (!parsed) return;
      if (!guardNewSavedDeals(1, readDealsFromVault().length)) return;

      const imported = createDealInVault(parsed, parsed.purchase.dealName);
      const nextDeals = saveDealToVault(imported);
      setDeals(nextDeals);
      loadScenario(imported.payload, imported.scenarioId);
      queueScenarioPush(imported);
      void trackAnalyticsEvent('scenario_created', { source: 'share_import', signedIn: Boolean(currentUser?.id) });
      void trackAnalyticsEvent('scenario_imported', { source: 'url_param', signedIn: Boolean(currentUser?.id) });
    }, 0);

    params.delete('s');
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);

    return () => window.clearTimeout(syncImportTimer);
  }, [guardNewSavedDeals, hasResolvedInitialAuth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const importedDealName = window.sessionStorage.getItem(SHARE_IMPORT_NOTICE_STORAGE_KEY);
    if (!importedDealName) return;

    window.sessionStorage.removeItem(SHARE_IMPORT_NOTICE_STORAGE_KEY);
    showSyncFeedback(`Imported shared deal: ${importedDealName}.`, 'success');
  }, [showSyncFeedback]);

  const emailAuthModeOptions: Array<{ mode: Exclude<EmailAuthMode, 'resetPassword'>; label: string }> = [
    { mode: 'signIn', label: 'Sign in' },
    { mode: 'createAccount', label: 'Create account' }
  ];
  const isPasswordResetMode = emailAuthMode === 'resetPassword';
  const authSubmitLabel =
    emailAuthMode === 'resetPassword'
      ? 'Update password'
      : emailAuthMode === 'signIn'
        ? 'Sign in with email'
        : 'Create account with email';

  const authMenuContent = (
    <>
      {!isPasswordResetMode ? (
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={authBusy || !isSupabaseConfigured}
          className="btn-primary btn-auth w-full rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-60"
        >
          Continue with Google
        </button>
      ) : null}
      <form
        className={`${isPasswordResetMode ? 'auth-email-panel rounded-xl p-2.5' : 'auth-email-panel mt-3 rounded-xl p-2.5'}`}
        aria-label={
          emailAuthMode === 'resetPassword'
            ? 'Password reset'
            : emailAuthMode === 'signIn'
              ? 'Email sign in'
              : 'Email account creation'
        }
        onSubmit={(event) => {
          event.preventDefault();
          submitEmailAuth();
        }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="auth-email-title text-xs font-semibold">{isPasswordResetMode ? 'Update password' : 'Email access'}</p>
          {isPasswordResetMode ? (
            <button
              type="button"
              onClick={() => {
                setEmailAuthMode('signIn');
                setResetPasswordValue('');
                setResetPasswordConfirmValue('');
                setAuthFeedback(null);
              }}
              className="auth-email-link text-[11px] font-semibold"
            >
              Back to sign in
            </button>
          ) : (
            <div className="auth-email-toggle inline-flex rounded-full p-0.5" aria-label="Email access mode">
              {emailAuthModeOptions.map((option) => {
                const isSelected = option.mode === emailAuthMode;

                return (
                  <button
                    key={option.mode}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      setEmailAuthMode(option.mode);
                      setAuthFeedback(null);
                    }}
                    className={`auth-email-toggle-button rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                      isSelected ? 'auth-email-toggle-button-active' : 'auth-email-toggle-button-idle'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="space-y-2">
          {isPasswordResetMode ? (
            <>
              <input
                type="password"
                aria-label="New password"
                value={resetPasswordValue}
                onChange={(event) => setResetPasswordValue(event.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                className="auth-email-input w-full rounded-lg px-3 py-2 text-xs outline-none ring-0"
              />
              <input
                type="password"
                aria-label="Confirm new password"
                value={resetPasswordConfirmValue}
                onChange={(event) => setResetPasswordConfirmValue(event.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
                className="auth-email-input w-full rounded-lg px-3 py-2 text-xs outline-none ring-0"
              />
            </>
          ) : (
            <>
              <input
                type="email"
                aria-label="Email address"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="auth-email-input w-full rounded-lg px-3 py-2 text-xs outline-none ring-0"
              />
              <input
                type="password"
                aria-label="Password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                placeholder={emailAuthMode === 'signIn' ? 'Password' : 'Create password'}
                autoComplete={emailAuthMode === 'signIn' ? 'current-password' : 'new-password'}
                className="auth-email-input w-full rounded-lg px-3 py-2 text-xs outline-none ring-0"
              />
            </>
          )}
          <button
            type="submit"
            disabled={authBusy || !isSupabaseConfigured}
            className="btn-primary btn-auth w-full rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-60"
          >
            {authBusy
              ? emailAuthMode === 'resetPassword'
                ? 'Updating...'
                : emailAuthMode === 'signIn'
                  ? 'Signing in...'
                  : 'Creating account...'
              : authSubmitLabel}
          </button>
          {emailAuthMode === 'signIn' ? (
            <button
              type="button"
              onClick={() => void sendPasswordResetEmail()}
              disabled={authBusy || !isSupabaseConfigured}
              className="auth-email-link w-full text-left text-[11px] font-semibold disabled:opacity-60"
            >
              Forgot password?
            </button>
          ) : null}
        </div>
      </form>
      {!isSupabaseConfigured ? (
        <p className="mt-2 text-[11px] text-muted/90">
          Account sign-in is unavailable right now.
        </p>
      ) : null}
      {authFeedback ? (
        <p className={`mt-2 text-[11px] ${authFeedback.tone === 'success' ? 'text-accent' : 'text-red-300'}`}>{authFeedback.message}</p>
      ) : null}
    </>
  );

  const syncStatusLabel = currentUser
    ? cloudHealth === 'error'
      ? `Cloud sync needs retry${lastCloudError ? ` after ${lastCloudError}` : ''}.`
      : cloudHealth === 'ok'
        ? `Cloud synced for this account. ${deals.length} local ${deals.length === 1 ? 'deal' : 'deals'} available.`
        : 'Cloud sync is ready for this account.'
    : 'Local only until you sign in.';
  const renderAdminDashboardLink = (className: string) =>
    isAdminOwner ? (
      <Link
        href="/admin/analytics"
        onClick={() => {
          triggerHapticFeedback('light');
          setIsSettingsOpen(false);
          setCompactSheetView(null);
        }}
        className={`btn-primary btn-auth tap-feedback rounded-lg px-3 py-2 text-center text-xs font-medium ${className}`}
      >
        Admin dashboard
      </Link>
    ) : null;

  const renderSettingsActionsSection = ({ includeListingAction = false }: { includeListingAction?: boolean } = {}) => (
    <div className="settings-section settings-section-actions space-y-1.5">
      <p className="settings-section-kicker text-[11px] uppercase tracking-wide">Actions</p>
      <div className="settings-action-stack grid gap-2">
        {includeListingAction && model.purchase.listingUrl ? (
          <button
            type="button"
            onClick={() => {
              triggerHapticFeedback('light');
              window.open(normalizeListingUrl(model.purchase.listingUrl), '_blank', 'noopener,noreferrer');
            }}
            className="tap-feedback section-action section-action-utility btn-listing-active inline-flex w-full items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-100"
          >
            <span>View listing</span>
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M6 4h6v6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10.5 5.5 4.75 11.25" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            triggerHapticFeedback('light');
            void shareCurrentDeal('mobile-menu-trigger');
          }}
          className="tap-feedback section-action section-action-utility settings-action-button w-full rounded-lg px-2.5 py-2 text-left text-xs font-medium"
        >
          Send link
        </button>
        <button
          type="button"
          onClick={() => {
            triggerHapticFeedback('light');
            window.print();
          }}
          className="tap-feedback section-action section-action-utility settings-action-button w-full rounded-lg px-2.5 py-2 text-left text-xs font-medium"
        >
          Print to PDF
        </button>
        <button
          type="button"
          onClick={() => openFeedbackComposer('settings')}
          className="btn-primary btn-new-deal tap-feedback settings-feedback-button w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold"
        >
          Send feedback
        </button>
        <Link
          href="/help"
          onClick={() => {
            triggerHapticFeedback('light');
            setIsSettingsOpen(false);
          }}
          className="tap-feedback section-action section-action-utility settings-action-button w-full rounded-lg px-2.5 py-2 text-left text-xs font-medium"
        >
          Help &amp; methodology
        </Link>
        <button
          type="button"
          onClick={() => {
            triggerHapticFeedback('light');
            loadSampleDeal();
          }}
          className="tap-feedback section-action section-action-utility settings-action-button w-full rounded-lg px-2.5 py-2 text-left text-xs font-medium"
        >
          Load sample deal
        </button>
        <button
          type="button"
          onClick={() => {
            triggerHapticFeedback('light');
            replayQuickTutorial();
          }}
          className="tap-feedback section-action section-action-utility settings-action-button w-full rounded-lg px-2.5 py-2 text-left text-xs font-medium"
        >
          Replay quick tutorial
        </button>
        {!isPwaInstalled && isMobileViewport ? (
          <button
            type="button"
            onClick={openInstallPromptFromSettings}
            className="tap-feedback section-action section-action-utility settings-action-button w-full rounded-lg px-2.5 py-2 text-left text-xs font-medium"
          >
            Download the app!
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            triggerHapticFeedback('medium');
            resetOutputOrderingPreferences();
            resetSettingsDefaults();
          }}
          className="tap-feedback section-action section-action-utility settings-action-button w-full rounded-lg px-2.5 py-2 text-left text-xs font-medium"
        >
          Reset settings and order
        </button>
      </div>
    </div>
  );

  const renderSettingsMenuContent = ({ includeActions = true }: { includeActions?: boolean } = {}) => (
    <div className="settings-panel settings-panel-layout">
      <div className="settings-section settings-section-defaults space-y-1.5">
        <p className="settings-section-kicker text-[11px] uppercase tracking-wide">New Deal Defaults</p>
        <label className="settings-section-label text-[11px]" htmlFor="settings-default-strategy">
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
          className="settings-select w-full rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-2 text-xs outline-none focus:border-accent/70"
        >
          {strategyKeyOrder.map((strategy) => (
            <option key={strategy} value={strategy}>
              {activeStrategyLabels[strategy]}
            </option>
          ))}
        </select>
        <div className="space-y-2 pt-1">
          <p className="settings-section-label text-[11px]">Default projections strategies</p>
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
                      ? 'settings-chip-active'
                      : 'section-action section-action-utility settings-action-button'
                  }`}
                >
                  {activeStrategyLabels[strategy]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="settings-section settings-section-appearance space-y-1.5">
        <p className="settings-section-kicker text-[11px] uppercase tracking-wide">Appearance</p>
        <div className="section-inner flex items-center justify-between gap-3 rounded-lg px-2.5 py-2">
          <span className="settings-row-label text-xs">Theme</span>
          <button
            type="button"
            onClick={() => {
              triggerHapticFeedback('light');
              setIsLightMode((value) => !value);
            }}
            className="tap-feedback section-action section-action-utility settings-action-button rounded-md px-2 py-1 text-[11px] font-semibold"
            aria-pressed={isLightMode}
          >
            {isLightMode ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
        <div className="section-inner flex items-center justify-between gap-3 rounded-lg px-2.5 py-2">
          <span className="settings-row-label text-xs">Workspace view</span>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-black/15 p-1">
            {workspaceViewModeOptions.map((option) => {
              const isSelected = workspaceViewMode === option.value;

              return (
                <button
                  key={`workspace-view-${option.value}`}
                  type="button"
                  onClick={() => {
                    triggerHapticFeedback('light');
                    setWorkspaceViewMode(option.value);
                  }}
                  aria-pressed={isSelected}
                  className={`tap-feedback rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                    isSelected ? 'settings-chip-active' : 'section-action section-action-utility settings-action-button'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="section-inner flex items-center justify-between gap-3 rounded-lg px-2.5 py-2">
          <span className="settings-row-label text-xs">Quick scan</span>
          <button
            type="button"
            onClick={() => {
              triggerHapticFeedback('light');
              setIsQuickScanVisible((value) => !value);
            }}
            className="tap-feedback section-action section-action-utility settings-action-button rounded-md px-2 py-1 text-[11px] font-semibold"
            aria-pressed={isQuickScanVisible}
          >
            {isQuickScanVisible ? 'Shown' : 'Hidden'}
          </button>
        </div>
        <div className="section-inner flex items-center justify-between gap-3 rounded-lg px-2.5 py-2">
          <span className="settings-row-label text-xs">Core KPI order</span>
          <button
            type="button"
            onClick={() => {
              triggerHapticFeedback('light');
              setIsHeadlineMetricOrderEditorOpen((value) => !value);
            }}
            className="tap-feedback section-action section-action-utility settings-action-button rounded-md px-2 py-1 text-[11px] font-semibold"
            aria-pressed={isHeadlineMetricOrderEditorOpen}
          >
            {isHeadlineMetricOrderEditorOpen ? 'Done' : 'Arrange'}
          </button>
        </div>
        {isHeadlineMetricOrderEditorOpen ? (
          <div className="settings-kpi-editor section-inner space-y-1 rounded-lg p-2">
            {orderedHeadlineMetricIds.map((metricId, index) => {
              const metricLabel = headlineMetricOptions.find((option) => option.id === metricId)?.label ?? metricId;

              return (
                <div key={`settings-kpi-order-${metricId}`} className="section-inner-muted flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
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
      </div>

      <div className="settings-section settings-section-data space-y-1.5">
        <p className="settings-section-kicker text-[11px] uppercase tracking-wide">Data safety</p>
        <div className="section-inner space-y-2 rounded-lg px-2.5 py-2">
          <p className="settings-row-label text-xs">{syncStatusLabel}</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <button
              type="button"
              onClick={() => void retryCloudSync()}
              disabled={!currentUser || isRetryingCloudSync}
              className="tap-feedback section-action section-action-utility settings-action-button rounded-lg px-2.5 py-2 text-left text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRetryingCloudSync ? 'Retrying...' : 'Retry cloud sync'}
            </button>
            <button
              type="button"
              onClick={exportDealVaultBackup}
              className="tap-feedback section-action section-action-utility settings-action-button rounded-lg px-2.5 py-2 text-left text-xs font-medium"
            >
              Export backup
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHapticFeedback('light');
                importBackupInputRef.current?.click();
              }}
              className="tap-feedback section-action section-action-utility settings-action-button rounded-lg px-2.5 py-2 text-left text-xs font-medium"
            >
              Import backup
            </button>
            <input
              ref={importBackupInputRef}
              type="file"
              accept="application/json,.json"
              aria-label="Import deal vault backup"
              className="sr-only"
              onChange={(event) => void importDealVaultBackup(event)}
            />
          </div>
        </div>
      </div>

      {includeActions ? renderSettingsActionsSection() : null}
    </div>
  );

  const renderShareFeedbackToast = (anchor: ShareFeedbackAnchor, align: 'left' | 'right' = 'right') => {
    if (shareFeedback?.anchor !== anchor) return null;

    const isSuccess = shareFeedback.tone === 'success';

    return (
      <div
        role="status"
        className={`absolute top-full z-[190] mt-2 w-max max-w-[min(18rem,calc(100vw-2rem))] rounded-xl border px-3 py-2 text-xs font-semibold shadow-soft ${
          align === 'right' ? 'right-0' : 'left-0'
        } ${
          isSuccess
            ? 'border-emerald-300/65 bg-emerald-500 text-emerald-950 shadow-[0_12px_28px_rgba(16,185,129,0.28)]'
            : 'border-red-300/65 bg-red-500 text-white shadow-[0_12px_28px_rgba(239,68,68,0.25)]'
        }`}
      >
        <p>{shareFeedback.message}</p>
        {shareFeedback.fallbackUrl ? (
          <p className="mt-1 max-w-[16rem] truncate text-[10px] font-medium opacity-85">{shareFeedback.fallbackUrl}</p>
        ) : null}
      </div>
    );
  };

  const dealIdentitySheet = (
    <MobileSheet open={isDealIdentityOpen} title="Deal identity" onClose={closeDealIdentityEditor}>
      <div className="mobile-sheet-stack space-y-4">
        {isMobileViewport ? (
          <section className="section-shell section-shell-utility rounded-2xl p-3">
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
                  className="tap-feedback btn-listing-active inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium"
                  href={normalizeListingUrl(model.purchase.listingUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>View listing link</span>
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                    <path d="M6 4h6v6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M10.5 5.5 4.75 11.25" strokeLinecap="round" />
                  </svg>
                </a>
              </div>
            ) : null}
          </section>
        ) : (
          <section className="section-shell section-shell-utility rounded-3xl p-4 lg:p-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(260px,0.92fr)] lg:items-start">
              <div className="section-inner rounded-2xl p-4">
                <div className="mb-4">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-slate-100">Name and source link</h3>
                    <p className="mt-1 max-w-[48ch] text-sm text-muted">
                      This is the saved title and listing source for the active deal. Changes save automatically as you type.
                    </p>
                  </div>
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

                <p className="mt-3 text-xs text-muted">
                  Paste a Zillow or Redfin listing and DealCooker will auto-fill the deal name when the link includes an address slug.
                </p>
              </div>

              <div className="space-y-3">
                <section className="section-inner rounded-2xl p-4">
                  <p className="section-eyebrow-utility text-xs uppercase tracking-[0.16em]">Current snapshot</p>
                  <h3 className="mt-1 truncate text-lg font-semibold text-slate-100">{activeDealDisplayName}</h3>
                  <p className="mt-1 text-sm text-muted">Active strategy: {activeStrategyLabel}</p>
                  <p className="mt-3 truncate text-xs text-slate-300/80">
                    {model.purchase.listingUrl ? normalizeListingUrl(model.purchase.listingUrl) : 'No listing link attached yet.'}
                  </p>
                </section>

                <section className="section-inner rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted">Quick actions</p>
                  <div className="mt-3 grid gap-2">
                    {model.purchase.listingUrl ? (
                      <a
                        className="tap-feedback section-action section-action-utility btn-listing-active inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-100"
                        href={normalizeListingUrl(model.purchase.listingUrl)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span>View listing link</span>
                        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                          <path d="M6 4h6v6" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M10.5 5.5 4.75 11.25" strokeLinecap="round" />
                        </svg>
                      </a>
                    ) : null}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => void shareCurrentDeal('deal-identity-share')}
                        className="btn-primary btn-link tap-feedback min-h-10 w-full rounded-xl px-3 py-2 text-sm font-medium"
                      >
                        Send link
                      </button>
                      {renderShareFeedbackToast('deal-identity-share', 'left')}
                    </div>
                    <Link
                      href={printToPdfUrl}
                      onClick={() => void trackAnalyticsEvent('print_opened', { surface: 'deal_identity', strategy: activeStrategy })}
                      className="btn-primary btn-pdf inline-flex min-h-10 items-center justify-center rounded-xl px-3 py-2 text-sm font-medium"
                      target="_blank"
                    >
                      Print to PDF
                    </Link>
                  </div>
                </section>
              </div>
            </div>
          </section>
        )}
      </div>
    </MobileSheet>
  );

  const desktopDealVaultSheet = (
    <MobileSheet open={isDesktopDealVaultOpen} title="Deal Vault" onClose={() => setIsDesktopDealVaultOpen(false)}>
      <div className="mobile-sheet-stack space-y-4">
        <DealsVaultPanel
          deals={deals}
          activeDealId={activeDealId}
          activeDealName={model.purchase.dealName}
          onActiveDealChange={openDesktopVaultScenario}
          onSaveAs={saveDealAs}
          onCreateNew={launchNewDeal}
          onLoadSampleDeal={loadSampleDeal}
          onDeleteDeal={removeScenarioById}
        />
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
    <section className="dashboard-secondary-shell section-shell section-shell-analysis rounded-2xl p-3 shadow-soft">
      {isFlipStrategy ? (
        <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
          <span className="dashboard-meta text-[11px]">Flip-specific KPIs</span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 max-[359px]:grid-cols-1 sm:grid-cols-2 sm:gap-3 xl:grid-cols-6">
        {activeHeadlineMetricIds.map((metricId) => (
          <div key={`headline-metric-${metricId}`} className="min-w-0 h-full [&>div]:h-full">
            {renderHeadlineMetricCard(metricId)}
          </div>
        ))}
      </div>
    </section>
  );

  const desktopHeadlineMetricSection = (
    <div className="dashboard-summary-band">
      <div className="dashboard-kpi-strip desktop-outcome-kpi-strip">
        {activeHeadlineMetricIds.map((metricId) => (
          <div key={`desktop-headline-metric-${metricId}`} className="dashboard-kpi-strip-item">
            {renderHeadlineMetricCard(metricId, 'inline')}
          </div>
        ))}
      </div>
    </div>
  );
  const desktopInputViewportClassName =
    'pr-1 [overflow-anchor:none]';
  const desktopUtilityButtonClassName =
    'header-utility-button tap-feedback shrink-0';
  const renderDealReviewIcon = (idPrefix: string) => {
    const gradientId = `${idPrefix}-gradient`;
    const shapeId = `${idPrefix}-shape`;

    return (
      <svg viewBox="0 0 20 20" className="deal-review-icon h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.55" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="-4" y1="2" x2="24" y2="18" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2f95ff" />
            <stop offset="36%" stopColor="#77c7ff" />
            <stop offset="62%" stopColor="#fb8b23" />
            <stop offset="100%" stopColor="#ffd09c" />
            <animateTransform attributeName="gradientTransform" type="translate" values="-10 0; 10 0; -10 0" dur="2.4s" repeatCount="indefinite" />
          </linearGradient>
          <g id={shapeId}>
            <path d="M4.5 5.25h7.25a2.75 2.75 0 0 1 2.75 2.75v6.25H7.25A2.75 2.75 0 0 1 4.5 11.5V5.25Z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7 8h5M7 10.5h3.25" strokeLinecap="round" />
            <path d="M13.25 4.25 14 2.75l.75 1.5 1.5.75-1.5.75L14 7.25l-.75-1.5-1.5-.75 1.5-.75Z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="m12.75 14.25 2 2 3.25-4" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </defs>
        <use className="deal-review-icon-stroke-base" href={`#${shapeId}`} />
        <use className="deal-review-icon-stroke-gradient" href={`#${shapeId}`} stroke={`url(#${gradientId})`} />
        <g className="deal-review-icon-sparkles" fill="currentColor" stroke="none">
          <circle className="deal-review-icon-spark deal-review-icon-spark-1" cx="16.6" cy="4.1" r="0.55" />
          <circle className="deal-review-icon-spark deal-review-icon-spark-2" cx="5.6" cy="3.7" r="0.42" />
          <circle className="deal-review-icon-spark deal-review-icon-spark-3" cx="17.2" cy="15.7" r="0.48" />
        </g>
      </svg>
    );
  };

  const desktopPerformanceDashboard = (
    <div className="[overflow-anchor:none]">
      <StrategyComparison
        data={result}
        input={model}
        holdYears={model.assumptions.holdYears}
        visibleStrategies={desktopWorkspaceMode === 'projection' ? [activeStrategy] : compactCompareSelection}
        onToggleVisibleStrategy={desktopWorkspaceMode === 'compare' ? toggleCompactProjectionStrategy : undefined}
        defaultBoardOpen
        inlineModelingViews
      />
    </div>
  );

  const compactResultsView = !compactReadiness.ready ? (
    <section className="section-shell decision-empty-state rounded-[1.1rem] p-5" aria-live="polite">
      <span className="decision-status decision-status-incomplete">Incomplete inputs</span>
      <h2 className="decision-empty-title mt-4 text-xl font-semibold">Add the deal basics first</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{incompleteDecisionDescription}</p>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Still needed: {compactReadiness.missing.join(', ')}. DealCooker will hold back zero-value verdicts and recommendations until the comparison is meaningful.
      </p>
      <button
        type="button"
        className="btn-primary mt-5 min-h-11 rounded-xl px-4 py-2 text-sm font-semibold"
        onClick={() => setCompactMode('inputs')}
      >
        Complete inputs
      </button>
    </section>
  ) : (
    <>
      <section className="section-shell section-shell-projection accent-edge accent-edge-projection isolate overflow-hidden rounded-2xl p-4 shadow-soft">
        <div className="space-y-4">
          <div className="results-hero-main priority-kpi-stable relative isolate">
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
                  viewBox="0 0 100 40"
                  className="cashflow-ribbon-mask absolute inset-x-0 bottom-0 h-[42%] w-full"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="cashflowBarPosGradCompact" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2ED6FF" stopOpacity="0.72" />
                      <stop offset="58%" stopColor="#028FEA" stopOpacity="0.36" />
                      <stop offset="100%" stopColor="#063C74" stopOpacity="0.1" />
                    </linearGradient>
                    <linearGradient id="cashflowBarNegGradCompact" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF9A1F" stopOpacity="0.76" />
                      <stop offset="58%" stopColor="#F97316" stopOpacity="0.38" />
                      <stop offset="100%" stopColor="#6B2404" stopOpacity="0.1" />
                    </linearGradient>
                  </defs>
                  {monthlyCashFlowBarData.map((bar, index) => (
                    <rect
                      key={`${bar.key}-compact`}
                      className="cashflow-ribbon-bar"
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={bar.height}
                      rx={bar.width / 2}
                      fill={bar.isNegative ? 'url(#cashflowBarNegGradCompact)' : 'url(#cashflowBarPosGradCompact)'}
                      opacity={0.66}
                      style={prefersReducedMotion ? undefined : { animationDelay: `${Math.min(index * 18, 260)}ms` }}
                    />
                  ))}
                </svg>
              </div>
            ) : null}

            <div className="relative z-10 pr-16">
              <div className="flex items-center gap-2">
                <p className="dashboard-kicker kpi-strip-label text-[15px] sm:text-base">{priorityMetricTitle}</p>
                {supportsReserveToggle ? <ReserveModeTooltip strategy={activeStrategy} includeReserves={includeReserves} /> : null}
              </div>
              {priorityMetricSubtitle ? <p className="dashboard-meta mt-1 text-sm">{priorityMetricSubtitle}</p> : null}
              <span className="dashboard-pill absolute right-0 top-0 whitespace-nowrap">{activeStrategyLabel}</span>
            </div>

            <div className="relative z-10 mt-3 flex flex-col gap-3">
              <p
                key={`priority-kpi-mobile-${priorityMetricMotion.key}`}
                className={`text-4xl font-semibold tracking-tight ${priorityMetricValue >= 0 ? 'priority-metric-positive' : 'text-white'} ${priorityMetricMotionClass}`}
                data-testid="kpi-priority-metric"
                style={priorityMetricNegativeStyle}
              >
                {formattedPriorityMetricValue}
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
        <section className="results-hero-support">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="dashboard-kicker">Commercial snapshot</p>
              <h3 className="mt-1 text-base font-semibold">Underwriting signals</h3>
            </div>
            <div className="dashboard-meta text-right text-[11px]">
              <p>Leased: {commercialSummary.occupiedSqft.toLocaleString()} sf</p>
              <p>GLA: {commercialSummary.grossLeasableAreaSqft.toLocaleString()} sf</p>
            </div>
          </div>
          <div className="results-hero-support-grid mt-4 sm:grid-cols-3">
            <div className="results-hero-stat">
              <p className="dashboard-kicker text-[11px]">Occupancy headroom</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">
                {percentFormatter.format(commercialSummary.physicalOccupancyPercent)} now vs {percentFormatter.format(commercialSummary.breakEvenOccupancyPercent)} break-even
              </p>
            </div>
            <div className="results-hero-stat">
              <p className="dashboard-kicker text-[11px]">Debt efficiency</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">
                Debt yield {percentFormatter.format(commercialSummary.debtYield)} on {currencyFormatter.format(commercialSummary.annualNoi)} NOI
              </p>
            </div>
            <div className="results-hero-stat">
              <p className="dashboard-kicker text-[11px]">Risk drag</p>
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

  const compactCompareView = !compactReadiness.ready ? (
    <section className="section-shell decision-empty-state rounded-[1.1rem] p-5" aria-live="polite">
      <span className="decision-status decision-status-incomplete">Incomplete inputs</span>
      <h2 className="decision-empty-title mt-4 text-xl font-semibold">Add the deal basics first</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{incompleteDecisionDescription}</p>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Still needed: {compactReadiness.missing.join(', ')}. DealCooker will hold back zero-value projections until the comparison is meaningful.
      </p>
      <button
        type="button"
        className="btn-primary mt-5 min-h-11 rounded-xl px-4 py-2 text-sm font-semibold"
        onClick={() => setCompactMode('inputs')}
      >
        Complete inputs
      </button>
    </section>
  ) : (
    <>
      <section aria-label="Projections strategy selection" className="mobile-stagger-item section-shell section-shell-projection rounded-2xl p-4 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-eyebrow-projection text-xs uppercase tracking-[0.16em]">Projections</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-100">Choose strategies</h2>
          </div>
          <span className="rounded-full border border-white/15 bg-black/20 px-2.5 py-1 text-[11px] text-slate-200">
            {compactCompareSelection.length} selected
          </span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          DealCooker starts with the active strategy so the projection stays focused. Add strategies only when you want a true comparison.
        </p>
        <div className="projection-selection-actions mt-3">
          <button
            type="button"
            className="section-action section-action-utility min-h-10 rounded-lg px-3 text-xs font-semibold"
            onClick={() => setCompactSelectedStrategies([activeStrategy])}
          >
            Active only
          </button>
          <button
            type="button"
            className="section-action section-action-utility min-h-10 rounded-lg px-3 text-xs font-semibold"
            onClick={() => setCompactSelectedStrategies([...strategyKeyOrder])}
          >
            Compare all
          </button>
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
                className={`tap-feedback mobile-stagger-item rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  isSelected ? 'btn-selector btn-selector-board btn-selector-projection btn-selector-active text-white' : 'btn-selector btn-selector-board btn-selector-projection text-slate-200'
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
          <section className="section-shell section-shell-utility flex h-[min(62dvh,540px)] flex-col rounded-2xl p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-muted">Deal Vault</p>
                <p className="mt-1 text-sm text-slate-100">Open, duplicate, or delete saved scenarios without leaving the mobile workflow.</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className="rounded-full border border-white/15 bg-black/20 px-2.5 py-1 text-[11px] text-slate-200">
                  {deals.length} total
                </span>
                <button
                  type="button"
                  onClick={() => {
                    triggerHapticFeedback('light');
                    loadSampleDeal();
                  }}
                  className="tap-feedback section-action section-action-utility min-h-8 rounded-lg px-2.5 text-[11px] font-semibold text-slate-100"
                >
                  Sample deal
                </button>
              </div>
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
                        deal.scenarioId === activeDealId ? 'accent-edge accent-edge-utility' : 'section-inner'
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
                          className="tap-feedback section-action section-action-utility rounded-lg px-3 py-2 text-sm font-medium text-slate-100"
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
                <p className="section-inner w-full rounded-xl border-dashed px-3 py-2 text-sm text-muted">
                  {compactDealsSearch.trim()
                    ? 'No deals match this search.'
                    : 'No saved deals yet. Start with a blank one or load the sample deal.'}
                </p>
              </div>
            )}
          </section>
        </div>
      </MobileSheet>

      <MobileSheet open={compactSheetView === 'strategy'} title="Choose strategy" onClose={() => setCompactSheetView(null)}>
        <div className="mobile-sheet-stack space-y-3">
          <p className="px-1 text-sm text-muted">Choose the strategy you are underwriting. Comparison stays available in Projections.</p>
          <div className="space-y-2">
            {strategyKeyOrder.map((strategy) => {
              const isActive = activeStrategy === strategy;

              if (strategy === 'longTerm') {
                const isRegularActive = isActive && !model.longTerm.turnaround.enabled;
                const isTurnaroundActive = isActive && model.longTerm.turnaround.enabled;

                return (
                  <div key={`compact-strategy-sheet-${strategy}`} className={`long-term-strategy-combo grid w-full grid-cols-[2fr_1fr] overflow-hidden rounded-2xl ${isActive ? 'long-term-strategy-combo-active' : ''}`}>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHapticFeedback('light');
                        setLongTermTurnaroundEnabled(false);
                        handleStrategyChange(strategy);
                        setCompactSheetView(null);
                      }}
                      className={`tap-feedback btn-selector btn-selector-input rounded-none px-4 py-3 text-left transition ${
                        isRegularActive ? 'btn-selector-active text-white' : 'text-slate-200'
                      }`}
                    >
                      <p className="text-sm font-semibold text-slate-100">{activeStrategyLabels[strategy]}</p>
                      <p className={`mt-1 text-xs ${isRegularActive ? 'text-slate-200/85' : 'text-muted'}`}>{compactStrategyDescriptions[strategy]}</p>
                    </button>
                    <button
                      type="button"
                      aria-label="Long-Term turnaround"
                      aria-pressed={isTurnaroundActive}
                      onClick={() => {
                        triggerHapticFeedback('light');
                        setLongTermTurnaroundEnabled(true);
                        handleStrategyChange(strategy);
                        setCompactSheetView(null);
                      }}
                      className={`tap-feedback btn-selector btn-selector-input turnaround-strategy-toggle flex flex-col items-center justify-center gap-1 rounded-none px-3 py-3 transition ${
                        isTurnaroundActive ? 'btn-selector-active turnaround-strategy-toggle-active text-white' : 'text-slate-200'
                      }`}
                    >
                      <TurnaroundIcon className="h-5 w-5" />
                      <span className="text-[10px] font-semibold">Turnaround</span>
                    </button>
                  </div>
                );
              }

              return (
                <button
                  key={`compact-strategy-sheet-${strategy}`}
                  type="button"
                  onClick={() => {
                    triggerHapticFeedback('light');
                    handleStrategyChange(strategy);
                    setCompactSheetView(null);
                  }}
                  className={`tap-feedback flex w-full items-start justify-between gap-3 rounded-2xl px-4 py-3 text-left transition ${
                    isActive ? 'btn-selector btn-selector-input btn-selector-active text-white' : 'btn-selector btn-selector-input text-slate-200'
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{activeStrategyLabels[strategy]}</p>
                    <p className={`mt-1 text-xs ${isActive ? 'text-slate-200/85' : 'text-muted'}`}>{compactStrategyDescriptions[strategy]}</p>
                  </div>
                  <span className={`strategy-selected-check shrink-0 ${isActive ? 'strategy-selected-check-active' : ''}`} aria-hidden="true">
                    {isActive ? '✓' : ''}
                  </span>
                  {isActive ? <span className="sr-only">Selected</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      </MobileSheet>

      <MobileSheet open={compactSheetView === 'menu'} title="Settings" onClose={() => setCompactSheetView(null)}>
        <div className="mobile-sheet-stack settings-mobile-stack space-y-4">
          <section className="settings-deal-tools-section settings-menu-shell section-shell section-shell-utility rounded-2xl p-3">
            {renderSettingsActionsSection({ includeListingAction: true })}
          </section>

          <section className="settings-preferences-section settings-menu-shell section-shell section-shell-utility rounded-2xl p-3">
            <p className="mb-3 text-xs uppercase tracking-[0.16em] text-muted">Preferences</p>
            {renderSettingsMenuContent({ includeActions: false })}
          </section>

          <section className="settings-account-section section-shell section-shell-utility rounded-2xl p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-muted">Account</p>
                <p className="mt-1 text-sm text-slate-100">
                  {currentUser ? (currentUser.email ? `Signed in as ${currentUser.email}` : 'Signed in on this device.') : 'Sign in to sync deals.'}
                </p>
              </div>
              {currentUser ? renderProfileAvatar({ label: signedInAvatarLabel }) : null}
            </div>
            {currentUser ? (
              <div className="space-y-2">
                {isPasswordResetMode ? authMenuContent : null}
                {renderAdminDashboardLink('block w-full')}
                <button
                  type="button"
                  onClick={signOut}
                  disabled={authBusy || !isSupabaseConfigured}
                  className="btn-primary btn-auth w-full rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-60"
                >
                  Sign out
                </button>
                {authFeedback ? (
                  <p className={`text-[11px] ${authFeedback.tone === 'success' ? 'text-accent' : 'text-red-300'}`}>{authFeedback.message}</p>
                ) : null}
              </div>
            ) : (
              authMenuContent
            )}
          </section>
        </div>
      </MobileSheet>

      <MobileSheet open={compactSheetView === 'metrics'} title="More metrics" onClose={() => setCompactSheetView(null)}>
        <div className="mobile-sheet-stack space-y-4">
          {!hasMoreMetricsContent ? (
            <section className="section-inner rounded-2xl border-dashed p-3">
              <p className="text-sm text-muted">No additional scenario-specific metrics are available for this strategy right now.</p>
            </section>
          ) : null}

          {strategyQuickScan ? (
            <section className="section-shell section-shell-analysis rounded-2xl p-3">
              <p className="section-eyebrow-analysis text-xs uppercase tracking-[0.16em]">Quick scan</p>
              <h3 className="mt-1 text-base font-semibold text-slate-100">{strategyQuickScan.title}</h3>
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
            <section className="section-shell section-shell-analysis rounded-2xl p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted">Commercial outputs</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {commercialDigestItems.map((item) => (
                  <article key={`compact-metric-${item.key}`} className="section-inner rounded-xl px-3 py-2">
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
            <section className="section-shell section-shell-analysis rounded-2xl p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted">Long-term turnaround outputs</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {longTermTurnaroundDigestItems.map((item) => (
                  <article key={`compact-lt-metric-${item.key}`} className="section-inner rounded-xl px-3 py-2">
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

  const compactModeNav = (
    <nav
      aria-label="Mobile view switcher"
      className="mobile-bottom-nav section-shell section-shell-input fixed inset-x-3 bottom-3 z-[120] rounded-2xl p-2 shadow-soft backdrop-blur"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }}
    >
      <div className="grid grid-cols-3 gap-2">
        {(['inputs', 'results', 'compare'] as CompactMode[]).map((mode) => {
          const isActive = compactMode === mode;

          return (
            <button
              key={mode}
              ref={mode === 'results' ? compactResultsNavButtonRef : mode === 'compare' ? compactCompareNavButtonRef : null}
              type="button"
              onClick={() => {
                if (!isActive) triggerHapticFeedback('light');
                setCompactMode(mode);
              }}
              className={`mobile-nav-button tap-feedback min-h-11 rounded-xl px-3 py-2 text-sm font-medium transition ${
                isActive ? 'btn-primary btn-mobile-nav-active mobile-nav-button-active' : 'section-action section-action-input text-slate-200'
              }`}
            >
              {compactModeLabels[mode]}
            </button>
          );
        })}
      </div>
    </nav>
  );

  const compactModeNavPortal =
    isClientMounted && isMobileViewport && typeof document !== 'undefined'
      ? createPortal(compactModeNav, document.body)
      : null;

  const feedbackReminderDialog = isFeedbackPromptOpen ? (
    <div
      className="feedback-reminder-backdrop fixed inset-0 z-[220] flex items-start justify-center px-4 py-5 sm:items-center"
      role="presentation"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 1.25rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 1.25rem)'
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-reminder-title"
        className="feedback-reminder-panel max-h-[calc(100dvh-2.5rem)] w-full max-w-sm overflow-y-auto rounded-2xl p-4 shadow-soft"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="settings-section-kicker text-[11px] uppercase tracking-wide">Open testing</p>
            <h2 id="feedback-reminder-title" className="mt-1 text-base font-semibold">
              Send DealCooker feedback
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsFeedbackPromptOpen(false)}
            className="tap-feedback section-action section-action-utility inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
            aria-label="Close feedback reminder"
          >
            X
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Tell me what felt confusing, broken, or worth improving.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => openFeedbackComposer('reminder')}
            className="btn-primary btn-auth tap-feedback min-h-10 rounded-xl px-3 py-2 text-sm font-semibold"
          >
            Send feedback
          </button>
          <button
            type="button"
            onClick={() => setIsFeedbackPromptOpen(false)}
            className="tap-feedback section-action section-action-utility min-h-10 rounded-xl px-3 py-2 text-sm font-medium"
          >
            Not now
          </button>
        </div>
      </section>
    </div>
  ) : null;

  const feedbackComposerDialog = isFeedbackComposerOpen ? (
    <div
      className="feedback-reminder-backdrop fixed inset-0 z-[230] flex items-start justify-center px-4 py-5 sm:items-center"
      role="presentation"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 1.25rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 1.25rem)'
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-composer-title"
        className="feedback-reminder-panel feedback-composer-panel max-h-[calc(100dvh-2.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl p-4 shadow-soft"
      >
        <form className="space-y-4" onSubmit={submitFeedback}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="settings-section-kicker text-[11px] uppercase tracking-wide">Open testing</p>
              <h2 id="feedback-composer-title" className="mt-1 text-base font-semibold">
                Send DealCooker feedback
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsFeedbackComposerOpen(false)}
              className="tap-feedback section-action section-action-utility inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
              aria-label="Close feedback form"
            >
              X
            </button>
          </div>

          <label className="block space-y-1.5">
            <span className="settings-section-label text-[11px]">Feedback</span>
            <textarea
              value={feedbackDraft}
              onChange={(event) => {
                if (feedbackSubmitState === 'sent') return;
                setFeedbackDraft(event.target.value.slice(0, FEEDBACK_MESSAGE_MAX_LENGTH));
                if (feedbackSubmitState !== 'sending') {
                  setFeedbackSubmitState('idle');
                  setFeedbackSubmitMessage(null);
                }
              }}
              maxLength={FEEDBACK_MESSAGE_MAX_LENGTH}
              aria-label="Feedback"
              required
              disabled={feedbackSubmitState === 'sending' || feedbackSubmitState === 'sent'}
              rows={5}
              className="feedback-input min-h-32 w-full resize-y rounded-xl border px-3 py-2 text-sm outline-none"
              placeholder="What felt confusing, broken, or worth improving?"
            />
            <span className="block text-right text-[10px] text-muted">
              {feedbackDraft.length}/{FEEDBACK_MESSAGE_MAX_LENGTH}
            </span>
          </label>

          <p className="text-xs leading-relaxed text-muted">
            DealCooker includes your signed-in account contact info automatically so Dillon can follow up directly.
          </p>

          {feedbackSubmitMessage ? (
            <p
              role="status"
              className={`text-xs ${feedbackSubmitState === 'sent' ? 'text-accent' : feedbackSubmitState === 'error' ? 'text-red-300' : 'text-muted'}`}
            >
              {feedbackSubmitMessage}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="submit"
              disabled={feedbackSubmitState === 'sending' || feedbackSubmitState === 'sent'}
              className="btn-primary btn-auth tap-feedback min-h-10 rounded-xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70"
            >
              {feedbackSubmitState === 'sending' ? 'Sending...' : feedbackSubmitState === 'sent' ? 'Sent' : 'Send feedback'}
            </button>
            <button
              type="button"
              onClick={() => setIsFeedbackComposerOpen(false)}
              className="tap-feedback section-action section-action-utility min-h-10 rounded-xl px-3 py-2 text-sm font-medium"
            >
              {feedbackSubmitState === 'sent' ? 'Done' : 'Cancel'}
            </button>
          </div>
        </form>
      </section>
    </div>
  ) : null;

  const dealReviewDialog = isDealReviewOpen ? (
    <div
      className="feedback-reminder-backdrop fixed inset-0 z-[235] flex items-start justify-center px-4 py-5 sm:items-center"
      role="presentation"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 1.25rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 1.25rem)'
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="deal-review-title"
        className="feedback-reminder-panel deal-review-panel max-h-[calc(100dvh-2.5rem)] w-full max-w-2xl overflow-y-auto rounded-2xl p-4 shadow-soft sm:p-5"
      >
        <form className="space-y-4" onSubmit={submitDealReviewRequest}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="settings-section-kicker text-[11px] uppercase tracking-wide">Deal review</p>
              <h2 id="deal-review-title" className="mt-1 text-lg font-semibold">
                Request a second opinion
              </h2>
            </div>
            <button
              type="button"
              onClick={closeDealReviewRequest}
              className="tap-feedback section-action section-action-utility inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
              aria-label="Close deal review request"
            >
              X
            </button>
          </div>

          <section className="section-inner rounded-xl px-3 py-2.5">
            <div className="grid gap-2 text-xs text-muted sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-100">{activeDealDisplayName}</p>
                <p className="mt-0.5 truncate">Active strategy: {activeStrategyLabel}</p>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <span className="dashboard-pill">{currencyFormatter.format(getTotalCashInvested(activeOutput))} invested</span>
                <span className="dashboard-pill">{currencyFormatter.format(activeOutput.monthlyCashFlow)}/mo</span>
              </div>
            </div>
          </section>

          <section className="section-inner-muted rounded-xl border border-orange-300/25 bg-orange-500/10 px-3 py-2.5 text-xs leading-relaxed text-orange-50">
            <p className="font-semibold text-orange-100">Coming soon: paid broker review</p>
            <p className="mt-1 text-orange-100/85">
              This will launch as a paid feature for deal-level feedback on offer range, assumptions, strategy fit, and next steps from a licensed broker or approved review partner.
            </p>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="settings-section-label text-[11px]">Name</span>
              <input
                aria-label="Name"
                value={dealReviewName}
                onChange={(event) => {
                  setDealReviewName(event.target.value);
                  if (dealReviewSubmitState !== 'sending') setDealReviewSubmitState('idle');
                }}
                className="feedback-input w-full rounded-xl border px-3 py-2 text-sm outline-none"
                placeholder="Your name"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="settings-section-label text-[11px]">Email</span>
              <input
                aria-label="Email"
                type="email"
                value={dealReviewEmail}
                onChange={(event) => {
                  setDealReviewEmail(event.target.value);
                  if (dealReviewSubmitState !== 'sending') setDealReviewSubmitState('idle');
                }}
                className="feedback-input w-full rounded-xl border px-3 py-2 text-sm outline-none"
                placeholder="you@example.com"
                required
              />
            </label>
            <label className="block space-y-1.5">
              <span className="settings-section-label text-[11px]">Phone</span>
              <input
                aria-label="Phone"
                value={dealReviewPhone}
                onChange={(event) => {
                  setDealReviewPhone(event.target.value);
                  if (dealReviewSubmitState !== 'sending') setDealReviewSubmitState('idle');
                }}
                className="feedback-input w-full rounded-xl border px-3 py-2 text-sm outline-none"
                placeholder="Optional"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="settings-section-label text-[11px]">Market / location</span>
              <input
                aria-label="Market / location"
                value={dealReviewMarket}
                onChange={(event) => {
                  setDealReviewMarket(event.target.value);
                  if (dealReviewSubmitState !== 'sending') setDealReviewSubmitState('idle');
                }}
                className="feedback-input w-full rounded-xl border px-3 py-2 text-sm outline-none"
                placeholder="City, state, or ZIP"
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="settings-section-label text-[11px]">What should be reviewed?</span>
            <select
              aria-label="What should be reviewed?"
              value={dealReviewFocus}
              onChange={(event) => {
                setDealReviewFocus(event.target.value);
                if (dealReviewSubmitState !== 'sending') setDealReviewSubmitState('idle');
              }}
              className="feedback-input deal-review-select w-full rounded-xl border px-3 py-2 text-sm outline-none"
            >
              {dealReviewFocusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="settings-section-label text-[11px]">Notes</span>
            <textarea
              aria-label="Notes"
              value={dealReviewNotes}
              onChange={(event) => {
                setDealReviewNotes(event.target.value.slice(0, DEAL_REVIEW_NOTES_MAX_LENGTH));
                if (dealReviewSubmitState !== 'sending') setDealReviewSubmitState('idle');
              }}
              maxLength={DEAL_REVIEW_NOTES_MAX_LENGTH}
              rows={4}
              className="feedback-input min-h-28 w-full resize-y rounded-xl border px-3 py-2 text-sm outline-none"
              placeholder="What decision are you trying to make?"
            />
            <span className="block text-right text-[10px] text-muted">
              {dealReviewNotes.length}/{DEAL_REVIEW_NOTES_MAX_LENGTH}
            </span>
          </label>

          <label className="section-inner-muted flex items-start gap-3 rounded-xl px-3 py-2.5 text-xs leading-relaxed text-muted">
            <input
              type="checkbox"
              checked={dealReviewConsent}
              onChange={(event) => {
                setDealReviewConsent(event.target.checked);
                if (dealReviewSubmitState !== 'sending') setDealReviewSubmitState('idle');
              }}
              className="mt-1 h-4 w-4 shrink-0 accent-[#fb8b23]"
              required
            />
            <span>
              Share this deal, contact info, and calculator inputs for review. A licensed real estate broker may review it and follow up; outside-market requests may be referred to a local review partner. This is not financial, legal, tax, or investment advice.
            </span>
          </label>

          {dealReviewSubmitMessage ? (
            <p
              role="status"
              className={`text-xs ${dealReviewSubmitState === 'sent' ? 'text-accent' : dealReviewSubmitState === 'error' ? 'text-red-300' : 'text-muted'}`}
            >
              {dealReviewSubmitMessage}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="submit"
              disabled={!DEAL_REVIEW_SUBMISSIONS_ENABLED || dealReviewSubmitState === 'sending' || dealReviewSubmitState === 'sent'}
              className="btn-primary btn-new-deal tap-feedback min-h-10 rounded-xl px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70"
            >
              {dealReviewSubmitState === 'sending' ? 'Sending...' : dealReviewSubmitState === 'sent' ? 'Sent' : 'Send for review'}
            </button>
            <button
              type="button"
              onClick={closeDealReviewRequest}
              className="tap-feedback section-action section-action-utility min-h-10 rounded-xl px-3 py-2 text-sm font-medium"
            >
              {dealReviewSubmitState === 'sent' ? 'Done' : 'Cancel'}
            </button>
          </div>
        </form>
      </section>
    </div>
  ) : null;

  const spreadsheetSummaryItems = [
    { label: 'Strategy', value: activeStrategyLabel },
    { label: model.purchase.ownershipMode === 'owned' ? 'Original basis' : 'Purchase', value: currencyFormatter.format(model.purchase.ownershipMode === 'owned' ? model.purchase.ownedPurchasePrice : model.purchase.purchasePrice) },
    { label: 'ARV', value: currencyFormatter.format(model.purchase.arv) },
    { label: 'Rehab', value: currencyFormatter.format(model.purchase.rehabBudget) },
    { label: 'Total invested', value: currencyFormatter.format(getTotalCashInvested(activeOutput)) },
    { label: 'Monthly CF', value: currencyFormatter.format(activeOutput.monthlyCashFlow) }
  ];
  const spreadsheetDigestItems = visibleDigestContent?.items ?? [];
  const spreadsheetDigestLabel =
    visibleDigestContent?.mode === 'commercial'
      ? 'Commercial outputs'
      : visibleDigestContent?.mode === 'turnaround'
        ? 'Long-term turnaround outputs'
        : 'Strategy outputs';

  const spreadsheetWorkspace = (
    <>
      <section
        ref={desktopResultsSectionRef}
        aria-label="Spreadsheet deal workspace"
        className="sheet-workspace [overflow-anchor:none]"
      >
        <div className="sheet-topline">
          <div className="sheet-title-cell">
            <p className="sheet-cell-label">Deal worksheet</p>
            <h2 className="sheet-deal-title">{activeDealDisplayName}</h2>
          </div>
          <div className="sheet-summary-grid" aria-label="Deal summary">
            {spreadsheetSummaryItems.map((item) => (
              <div key={`sheet-summary-${item.label}`} className="sheet-summary-cell">
                <p className="sheet-cell-label">{item.label}</p>
                <p className="sheet-cell-value">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="sheet-metrics-band">
          <div className="sheet-primary-metric priority-kpi-stable">
            <div className="sheet-primary-copy">
              <div className="flex min-w-0 items-center gap-2">
                <p className="sheet-cell-label">{priorityMetricTitle}</p>
                {supportsReserveToggle ? <ReserveModeTooltip strategy={activeStrategy} includeReserves={includeReserves} /> : null}
              </div>
              {priorityMetricSubtitle ? <p className="sheet-muted-text mt-1">{priorityMetricSubtitle}</p> : null}
            </div>
            <p
              key={`priority-kpi-sheet-${priorityMetricMotion.key}`}
              className={`sheet-priority-value ${priorityMetricValue >= 0 ? 'priority-metric-positive' : 'text-white'} ${priorityMetricMotionClass}`}
              data-testid="kpi-priority-metric"
              style={priorityMetricNegativeStyle}
            >
              {formattedPriorityMetricValue}
            </p>
            {supportsReserveToggle ? (
              <div className="sheet-reserve-toggle">
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
            ) : null}
          </div>

          <div className="sheet-kpi-grid" aria-label="Core metrics">
            {activeHeadlineMetricIds.map((metricId) => (
              <div key={`sheet-headline-metric-${metricId}`} className="sheet-kpi-cell">
                {renderHeadlineMetricCard(metricId, 'inline')}
              </div>
            ))}
          </div>
        </div>

        <div ref={desktopStrategyTabsRef} className="sheet-strategy-row">
          <div className="sheet-row-heading">
            <p className="sheet-cell-label">Strategy</p>
            <p className="sheet-row-title">{activeStrategyLabel}</p>
          </div>
          <StrategyTabs
            active={activeStrategy}
            onChange={openDesktopStrategyWorkspace}
            longTermTurnaroundEnabled={model.longTerm.turnaround.enabled}
            onLongTermTurnaroundChange={setLongTermTurnaroundEnabled}
            quickScan={strategyQuickScan}
            embeddedInRail
            actionSlot={
              <button
                type="button"
                onClick={() => {
                  triggerHapticFeedback('light');
                  setIsStrategyWorkOpen(true);
                }}
                className="btn-primary btn-spotlight btn-brand-profile tap-feedback flex h-full min-h-[2.35rem] items-center justify-center rounded-xl px-3 py-1.5 text-[0.8125rem] font-medium whitespace-nowrap"
              >
                Show work
              </button>
            }
          />
        </div>

        <div className="sheet-input-grid">
          <section ref={desktopCoreSectionRef} className="sheet-panel sheet-input-panel">
            <div className="sheet-panel-heading">
              <p className="sheet-cell-label">Inputs</p>
              <h3 className="sheet-panel-title">Purchase</h3>
            </div>
            <DealInputPanel
              value={model}
              onChange={updateModel}
              resolveListingDealName={resolveListingDealName}
              defaultAdvancedOptionsOpen={false}
              forcedCoreSection="purchaseFinancing"
              titleOverride="Purchase"
              contentViewportClassName={desktopInputViewportClassName}
              variant="embedded"
            />
          </section>

          <section ref={desktopStrategyInputsRef} className="sheet-panel sheet-input-panel">
            <div className="sheet-panel-heading">
              <p className="sheet-cell-label">Inputs</p>
              <h3 className="sheet-panel-title">{activeStrategyLabel}</h3>
            </div>
            <StrategyInputsWorkspace activeStrategy={activeStrategy} model={model} onChange={updateModel} embedded />
          </section>

          <section ref={desktopExpensesSectionRef} className="sheet-panel sheet-input-panel">
            <div className="sheet-panel-heading">
              <p className="sheet-cell-label">Inputs</p>
              <h3 className="sheet-panel-title">Expenses</h3>
            </div>
            <DealInputPanel
              value={model}
              onChange={updateModel}
              resolveListingDealName={resolveListingDealName}
              defaultAdvancedOptionsOpen={false}
              forcedCoreSection="expenses"
              contentViewportClassName={desktopInputViewportClassName}
              variant="embedded"
            />
          </section>
        </div>

        <div className="sheet-output-grid">
          <section className="sheet-panel sheet-output-panel">
            <div className="sheet-panel-heading">
              <p className="sheet-cell-label">Outputs</p>
              <h3 className="sheet-panel-title">Projections</h3>
            </div>
            {desktopPerformanceDashboard}
          </section>

          <section ref={irrStreamRef} className="sheet-panel sheet-output-panel">
            <div className="sheet-panel-heading">
              <p className="sheet-cell-label">Outputs</p>
              <h3 className="sheet-panel-title">IRR stream</h3>
            </div>
            <TimelineCard
              output={result[activeStrategy]}
              assumptions={model.assumptions}
              defaultOpen={Boolean(activeDealId)}
              collapsible={false}
              summaryVariant="compact"
              onAssumptionsChange={updateAssumptions}
              showTargetIrrInput={showTargetIrrInput}
              layoutVariant="strip"
            />
          </section>

          <section className="sheet-panel sheet-output-panel sheet-output-panel-wide">
            <div className="sheet-panel-heading">
              <p className="sheet-cell-label">Outputs</p>
              <h3 className="sheet-panel-title">{spreadsheetDigestLabel}</h3>
            </div>
            {spreadsheetDigestItems.length > 0 ? (
              <div className="sheet-digest-grid">
                {spreadsheetDigestItems.map((item) => (
                  <article key={`sheet-digest-${item.key}`} className="sheet-digest-row">
                    <p className="sheet-cell-label">{item.label}</p>
                    <p className="sheet-digest-value" style={getDigestMetricStyle(item)}>
                      {item.value}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <DealWorkoutCard
                model={model}
                strategy={activeStrategy}
                targetIrrPercent={model.assumptions.targetIrrPercent}
                onApply={applyDealWorkoutScenario}
              />
            )}
          </section>
        </div>
      </section>

      {isMobileViewport ? compactSheets : null}
    </>
  );

  const compactShell = (
    <>
      <section ref={mobileStrategyTabsRef} className="section-shell section-shell-input sticky top-2 z-30 space-y-2 rounded-2xl p-2 backdrop-blur">
        <button
          ref={compactStrategyButtonRef}
          type="button"
          onClick={() => {
            triggerHapticFeedback('light');
            setCompactSheetView('strategy');
          }}
          className="tap-feedback section-inner flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left"
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

        {compactMode === 'results' && compactReadiness.ready ? (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                triggerHapticFeedback('light');
                setCompactSheetView('metrics');
              }}
              disabled={!hasMoreMetricsContent}
              className="tap-feedback section-action section-action-projection rounded-xl px-3 py-3 text-sm font-medium text-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
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
              className="tap-feedback section-action section-action-projection rounded-xl px-3 py-3 text-sm font-medium text-slate-100"
            >
              Timeline
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHapticFeedback('light');
                setIsStrategyWorkOpen(true);
              }}
              className="btn-primary btn-spotlight tap-feedback rounded-xl px-3 py-3 text-sm font-semibold"
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
                  className={`tap-feedback flex min-h-[3.5rem] flex-col items-center justify-center rounded-xl px-2 py-2 text-center transition ${
                    isActive
                      ? 'btn-selector btn-selector-input btn-selector-active text-slate-100'
                      : 'btn-selector btn-selector-input text-slate-200'
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

      <section className="space-y-4 pb-4">
        <div key={`compact-mode-${compactMode}`} className="compact-view-panel panel-swap space-y-4">
          {compactMode === 'inputs' ? compactInputsView : null}
          {compactMode === 'results' ? compactResultsView : null}
          {compactMode === 'compare' ? compactCompareView : null}
        </div>
      </section>

      {compactSheets}
    </>
  );

  return (
    <main className={`app-shell-fade relative isolate min-h-screen overflow-x-clip px-3 py-5 sm:px-4 md:px-5 lg:px-6 xl:px-8 2xl:px-10${isLightMode ? ' theme-light' : ''}`}>
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-0 z-0 ${
          isLightMode
            ? 'bg-[linear-gradient(135deg,rgba(243,151,76,0.22)_0%,rgba(243,151,76,0.1)_16%,rgba(118,167,222,0.08)_42%,transparent_76%)]'
            : 'bg-[linear-gradient(135deg,rgba(244,145,48,0.26)_0%,rgba(244,145,48,0.12)_18%,rgba(92,150,220,0.1)_44%,transparent_78%)]'
        }`}
      />
      <div className="relative z-10 mx-auto max-w-[112rem] space-y-5">
        {isMobileViewport ? (
          <header className={`app-header-shell section-shell section-shell-utility relative z-[70] rounded-2xl p-4 shadow-soft backdrop-blur${isHeaderModalOpen ? ' pointer-events-none' : ''}`}>
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="brand-lockup" aria-label="DealCooker">
                    <h1 className="brand-text leading-none">DealCooker</h1>
                    <Image
                      src="/icon.png"
                      alt=""
                      width={543}
                      height={628}
                      sizes="36px"
                      className="brand-icon"
                      aria-hidden="true"
                      priority
                    />
                  </div>
                </div>
                <div className={`${headerChromeMutedClass} relative`}>
                  <div className="flex items-center gap-2">
                    {currentUser ? renderProfileAvatar({ sizeClassName: 'h-9 w-9', textClassName: 'text-[11px]', label: signedInAvatarLabel }) : null}
                    <button
                      ref={compactMenuButtonRef}
                      type="button"
                      onClick={() => {
                        triggerHapticFeedback('light');
                        setCompactSheetView('menu');
                      }}
                      className="tap-feedback section-action section-action-utility inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-100"
                      aria-label="Open settings"
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                        <path d="M5 7.5h14M5 12h14M5 16.5h14" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  {renderShareFeedbackToast('mobile-menu-trigger')}
                </div>
              </div>

              <div className={headerChromeMutedClass}>
                <div className="mobile-header-deal">
                  <button
                    ref={compactDealsButtonRef}
                    type="button"
                    onClick={() => {
                      triggerHapticFeedback('light');
                      setCompactSheetView('deals');
                    }}
                    className="tap-feedback mobile-header-deal-main"
                    aria-label="Deal Vault"
                  >
                    <div className="desktop-header-deal-copy">
                      <p className="dashboard-kicker header-deal-meta">Deal Vault</p>
                      <p className="header-deal-name truncate text-base font-semibold">{activeDealDisplayName}</p>
                      <p className="header-deal-meta truncate text-[11px]">
                        {deals.length} saved {deals.length === 1 ? 'deal' : 'deals'}
                      </p>
                    </div>
                    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                      <path d="M7.5 4.5 12.5 10l-5 5.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={launchNewDeal}
                    className="tap-feedback mobile-header-new-deal-compact"
                    aria-label="New deal"
                  >
                    New
                  </button>
                  <button
                    type="button"
                    onClick={openDealIdentityEditor}
                    className="header-utility-button hoverbox-trigger tap-feedback mobile-header-edit-button shrink-0"
                    aria-label="Edit active deal details"
                    data-hoverbox="Edit active deal details"
                  >
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                      <path d="M4.5 13.75V16h2.25l7-7-2.25-2.25-7 7Z" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="m10.5 6.5 2.25 2.25" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className={headerChromeMutedClass}>
                <div className="mobile-header-action-grid" aria-hidden="true">
                  <button
                    type="button"
                    onClick={launchNewDeal}
                    className="btn-primary btn-new-deal mobile-header-new-deal rounded-xl px-3 py-2.5 text-sm font-semibold"
                  >
                    New deal
                  </button>
                  <button
                    type="button"
                    onClick={() => void shareCurrentDeal('mobile-menu-trigger')}
                    className="header-utility-button hoverbox-trigger tap-feedback mobile-header-action-button btn-link"
                    aria-label="Send link"
                    data-hoverbox="Send link"
                  >
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                      <path d="M7.5 10.5 12.5 7.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="m7.5 9.5 5 3" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="5.5" cy="10" r="1.5" />
                      <circle cx="14.5" cy="6.5" r="1.5" />
                      <circle cx="14.5" cy="13.5" r="1.5" />
                    </svg>
                    <span className="sr-only">Send link</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHapticFeedback('light');
                      void trackAnalyticsEvent('print_opened', { surface: 'mobile_header', strategy: activeStrategy });
                      window.open(printToPdfUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="header-utility-button hoverbox-trigger tap-feedback mobile-header-action-button"
                    aria-label="Report"
                    data-hoverbox="Report"
                  >
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                      <path d="M6 2.75h5.25L15 6.5v10.75H6a1 1 0 0 1-1-1V3.75a1 1 0 0 1 1-1Z" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M11.25 2.75V6.5H15M7.75 10h4.5M7.75 12.75h3.25" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="sr-only">Report</span>
                  </button>
                  {model.purchase.listingUrl ? (
                    <Link
                      href={normalizeListingUrl(model.purchase.listingUrl)}
                      className="header-utility-button hoverbox-trigger tap-feedback mobile-header-action-button btn-listing-active"
                      aria-label="View listing"
                      data-hoverbox="View listing"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                        <path d="M6 4h6v6" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M10.5 5.5 4.75 11.25" strokeLinecap="round" />
                      </svg>
                      <span className="sr-only">View listing</span>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="header-utility-button hoverbox-trigger tap-feedback mobile-header-action-button"
                      aria-label="View listing"
                      data-hoverbox="View listing"
                    >
                      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                        <path d="M6 4h6v6" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M10.5 5.5 4.75 11.25" strokeLinecap="round" />
                      </svg>
                      <span className="sr-only">View listing</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openDealReviewRequest('mobile_header')}
                    className="header-utility-button hoverbox-trigger tap-feedback mobile-header-action-button btn-deal-review"
                    aria-label="Request deal review"
                    data-hoverbox="Request deal review"
                  >
                    {renderDealReviewIcon('mobile-deal-review-icon')}
                    <span className="sr-only">Request deal review</span>
                  </button>
                </div>
              </div>

              {syncFeedback ? (
                <div className={`rounded-xl border px-3 py-2 text-xs ${syncFeedbackClassName}`} role="status">
                  {syncFeedback.message}
                </div>
              ) : null}

              <div className={headerChromeMutedClass}>
                <PwaInstallBanner />
              </div>
            </div>
          </header>
        ) : null}

        {!isMobileViewport ? (
        <header className={`app-header-shell section-shell section-shell-utility relative z-[110] overflow-visible rounded-2xl px-5 py-3 shadow-soft backdrop-blur${isHeaderModalOpen ? ' pointer-events-none' : ''}`}>
          <div className="space-y-2">
            <div className="flex items-start gap-6 xl:gap-8">
              <div className="min-w-0">
                <div className="brand-lockup" aria-label="DealCooker">
                  <h1 className="brand-text leading-none">DealCooker</h1>
                  <Image
                    src="/icon.png"
                    alt=""
                    width={543}
                    height={628}
                    sizes="36px"
                    className="brand-icon"
                    aria-hidden="true"
                    priority
                  />
                </div>
              </div>

              <div className={`min-w-0 flex-1 xl:pl-1 ${headerChromeMutedClass}`}>
              <div ref={desktopHeaderActionsRef} className="header-toolbar relative overflow-visible">
                <div className="header-primary-cluster">
                  <button
                    type="button"
                    onClick={launchNewDeal}
                    className="btn-primary btn-new-deal inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold"
                  >
                    New deal
                  </button>
                  <div className="desktop-header-deal">
                    <button
                      ref={dealVaultRef}
                      type="button"
                      onClick={openDesktopDealVault}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                      aria-label="Open deal vault"
                    >
                      <div className="desktop-header-deal-copy">
                        <p className="dashboard-kicker header-deal-meta">Deal vault</p>
                        <p className="header-deal-name truncate text-sm font-semibold sm:text-base">{activeDealDisplayName}</p>
                        <p className="header-deal-meta truncate text-[11px]">
                          {deals.length} saved {deals.length === 1 ? 'deal' : 'deals'}
                        </p>
                      </div>
                      <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                        <path d="M7.5 4.5 12.5 10l-5 5.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={openDealIdentityEditor}
                      className={`${desktopUtilityButtonClassName} hoverbox-trigger`}
                      aria-label="Edit active deal details"
                      data-hoverbox="Edit active deal details"
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                        <path d="M4.5 13.75V16h2.25l7-7-2.25-2.25-7 7Z" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="m10.5 6.5 2.25 2.25" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div ref={authControlsRef} className="header-utility-group relative overflow-visible">
                  {model.purchase.listingUrl ? (
                    <Link
                      href={normalizeListingUrl(model.purchase.listingUrl)}
                      className={`${desktopUtilityButtonClassName} hoverbox-trigger btn-listing-active`}
                      aria-label="View listing"
                      data-hoverbox="View listing"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                        <path d="M6 4h6v6" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M10.5 5.5 4.75 11.25" strokeLinecap="round" />
                      </svg>
                      <span className="sr-only">View listing</span>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className={`${desktopUtilityButtonClassName} hoverbox-trigger`}
                      aria-label="View listing"
                      data-hoverbox="View listing"
                    >
                      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                        <path d="M6 4h6v6" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M10.5 5.5 4.75 11.25" strokeLinecap="round" />
                      </svg>
                      <span className="sr-only">View listing</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openDealReviewRequest('desktop_header')}
                    className={`${desktopUtilityButtonClassName} hoverbox-trigger btn-deal-review`}
                    aria-label="Request deal review"
                    data-hoverbox="Request deal review"
                  >
                    {renderDealReviewIcon('desktop-deal-review-icon')}
                    <span className="sr-only">Request deal review</span>
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => void shareCurrentDeal('desktop-share')}
                      className={`${desktopUtilityButtonClassName} hoverbox-trigger btn-link`}
                      aria-label="Send link"
                      data-hoverbox="Send link"
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                        <path d="M7.5 10.5 12.5 7.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="m7.5 9.5 5 3" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="5.5" cy="10" r="1.5" />
                        <circle cx="14.5" cy="6.5" r="1.5" />
                        <circle cx="14.5" cy="13.5" r="1.5" />
                      </svg>
                      <span className="sr-only">Send link</span>
                    </button>
                    {renderShareFeedbackToast('desktop-share')}
                  </div>
                  <Link
                    href={printToPdfUrl}
                    onClick={() => void trackAnalyticsEvent('print_opened', { surface: 'desktop_header', strategy: activeStrategy })}
                    className={`${desktopUtilityButtonClassName} hoverbox-trigger btn-pdf`}
                    aria-label="Print to PDF"
                    data-hoverbox="Print to PDF"
                    target="_blank"
                  >
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                      <path d="M6 6V3.75h8V6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M5.5 14H4.75A1.75 1.75 0 0 1 3 12.25V9.75A1.75 1.75 0 0 1 4.75 8h10.5A1.75 1.75 0 0 1 17 9.75v2.5A1.75 1.75 0 0 1 15.25 14H14.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M6 11.5h8v4.75H6z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="sr-only">Print to PDF</span>
                  </Link>
                  <span className="header-utility-divider" aria-hidden="true" />
                  <div ref={desktopAuthActionRef} className="flex flex-nowrap items-center justify-end gap-2">
                    {currentUser ? (
                      <>
                        {renderProfileAvatar({ label: signedInAvatarLabel })}
                        <button
                          type="button"
                          onClick={signOut}
                          disabled={authBusy || !isSupabaseConfigured}
                          className="btn-primary btn-auth btn-auth-top tap-feedback min-h-9 rounded-full px-3.5 py-1 text-xs font-medium disabled:opacity-60"
                        >
                          Sign out
                        </button>
                        {isPasswordResetMode && isAuthMenuOpen ? (
                          <div id="auth-menu-desktop" className="section-shell section-shell-utility absolute right-12 top-12 z-[136] w-72 rounded-xl p-3 shadow-soft backdrop-blur">
                            {authMenuContent}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            setIsSettingsOpen(false);
                            setIsAuthMenuOpen((value) => !value);
                          }}
                          aria-expanded={isAuthMenuOpen}
                          aria-controls="auth-menu-desktop"
                          className="btn-signin-trigger tap-feedback min-h-9 rounded-full px-3.5 py-1 text-xs font-medium"
                        >
                          Sign in
                        </button>
                        {isAuthMenuOpen ? (
                        <div id="auth-menu-desktop" className="section-shell section-shell-utility absolute right-0 top-12 z-[136] w-72 rounded-xl p-3 shadow-soft backdrop-blur">
                            {authMenuContent}
                          </div>
                        ) : null}
                      </div>
                    )}
                    <div ref={desktopSettingsControlsRef} className="relative overflow-visible">
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
                          <path d="M5 7.5h14M5 12h14M5 16.5h14" strokeLinecap="round" />
                        </svg>
                      </button>
                      {isSettingsOpen ? (
                        <div id="settings-menu-desktop" className="settings-menu-shell section-shell section-shell-utility absolute right-0 top-10 z-[136] w-[52rem] max-w-[calc(100vw-1rem)] rounded-xl p-3 shadow-soft backdrop-blur">
                          {isAdminOwner ? (
                            <div className="settings-section mb-3 space-y-2 rounded-xl border border-white/10 bg-white/[0.035] p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="settings-section-kicker text-[11px] uppercase tracking-wide">Owner account</p>
                                  <p className="mt-1 truncate text-xs text-slate-100">{signedInAvatarLabel}</p>
                                </div>
                                {renderProfileAvatar({ label: signedInAvatarLabel })}
                              </div>
                              {renderAdminDashboardLink('inline-flex w-auto min-w-[10rem] items-center justify-center')}
                            </div>
                          ) : null}
                          {renderSettingsMenuContent()}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>

            {syncFeedback ? (
              <div className={`fixed inset-x-3 bottom-4 z-50 rounded-lg border px-3 py-2 text-xs shadow-soft sm:inset-x-auto sm:right-4 sm:text-sm ${syncFeedbackClassName}`} role="status">
                {syncFeedback.message}
              </div>
            ) : null}

            <div className={headerChromeMutedClass}>
              <PwaInstallBanner />
            </div>

          </div>
        </header>
        ) : null}

        {workspaceViewMode === 'sheet' ? spreadsheetWorkspace : isMobileViewport ? compactShell : null}

        {!isMobileViewport && workspaceViewMode === 'studio' ? (
        <>
        <section ref={desktopResultsSectionRef} className="desktop-outcome-ribbon section-shell section-shell-projection accent-edge accent-edge-projection isolate overflow-hidden rounded-2xl p-3 shadow-soft xl:p-4">
          {!compactReadiness.ready ? (
            <div className="decision-empty-state decision-empty-state-centered" aria-live="polite">
              <div>
                <h2 className="decision-empty-title text-xl font-semibold">Add the deal basics to unlock the verdict</h2>
                <p className="mt-2 text-sm text-muted">{incompleteDecisionDescription}</p>
              </div>
            </div>
          ) : null}
          <div className={compactReadiness.ready ? undefined : 'hidden'}>
            <div className="desktop-outcome-grid">
            <div className="results-hero-main desktop-outcome-primary priority-kpi-stable relative isolate">
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
                    viewBox="0 0 100 40"
                    className="cashflow-ribbon-mask absolute inset-x-0 bottom-0 h-[42%] w-full"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="cashflowBarPosGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2ED6FF" stopOpacity="0.72" />
                        <stop offset="58%" stopColor="#028FEA" stopOpacity="0.36" />
                        <stop offset="100%" stopColor="#063C74" stopOpacity="0.1" />
                      </linearGradient>
                      <linearGradient id="cashflowBarNegGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FF9A1F" stopOpacity="0.76" />
                        <stop offset="58%" stopColor="#F97316" stopOpacity="0.38" />
                        <stop offset="100%" stopColor="#6B2404" stopOpacity="0.1" />
                      </linearGradient>
                    </defs>
                    {monthlyCashFlowBarData.map((bar, index) => (
                      <rect
                        key={bar.key}
                        className="cashflow-ribbon-bar"
                        x={bar.x}
                        y={bar.y}
                        width={bar.width}
                        height={bar.height}
                        rx={bar.width / 2}
                        fill={bar.isNegative ? 'url(#cashflowBarNegGrad)' : 'url(#cashflowBarPosGrad)'}
                        opacity={0.66}
                        style={prefersReducedMotion ? undefined : { animationDelay: `${Math.min(index * 18, 260)}ms` }}
                      />
                    ))}
                  </svg>
                </div>
              ) : null}
              <div className="relative z-10 flex flex-col gap-4">
                <div className="priority-kpi-header flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <p className="dashboard-kicker kpi-strip-label text-[15px] sm:text-base">{priorityMetricTitle}</p>
                      {supportsReserveToggle ? <ReserveModeTooltip strategy={activeStrategy} includeReserves={includeReserves} /> : null}
                    </div>
                    {priorityMetricSubtitle ? <p className="dashboard-meta mt-1 text-sm">{priorityMetricSubtitle}</p> : null}
                  </div>
                  {supportsReserveToggle ? (
                    <div className="priority-reserve-toggle-slot flex shrink-0 items-center">
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

                <div className="flex flex-col gap-3">
                  <p
                    key={`priority-kpi-desktop-${priorityMetricMotion.key}`}
                    className={`priority-kpi-value text-4xl font-semibold tracking-tight sm:text-5xl ${priorityMetricValue >= 0 ? 'priority-metric-positive' : 'text-white'} ${priorityMetricMotionClass}`}
                    data-testid="kpi-priority-metric"
                    style={priorityMetricNegativeStyle}
                  >
                    {formattedPriorityMetricValue}
                  </p>
                </div>
              </div>
            </div>

            <div className="desktop-outcome-metrics">
              {desktopHeadlineMetricSection}
            </div>

            <div className="desktop-outcome-actions">
              {activeStrategy === 'purchase' && commercialSummary ? (
                <section className="results-hero-support">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="dashboard-kicker">Commercial snapshot</p>
                      <h3 className="mt-1 text-base font-semibold">Underwriting signals</h3>
                    </div>
                    <div className="dashboard-meta text-right text-[11px]">
                      <p>Leased: {commercialSummary.occupiedSqft.toLocaleString()} sf</p>
                      <p>GLA: {commercialSummary.grossLeasableAreaSqft.toLocaleString()} sf</p>
                    </div>
                  </div>
                  <div className="results-hero-support-grid mt-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                    <div className="results-hero-stat">
                      <p className="dashboard-kicker text-[11px]">Occupancy headroom</p>
                      <p className="mt-1 text-sm font-semibold text-slate-100">
                        {percentFormatter.format(commercialSummary.physicalOccupancyPercent)} now vs {percentFormatter.format(commercialSummary.breakEvenOccupancyPercent)} break-even
                      </p>
                    </div>
                    <div className="results-hero-stat">
                      <p className="dashboard-kicker text-[11px]">Debt efficiency</p>
                      <p className="mt-1 text-sm font-semibold text-slate-100">
                        Debt yield {percentFormatter.format(commercialSummary.debtYield)} on {currencyFormatter.format(commercialSummary.annualNoi)} NOI
                      </p>
                    </div>
                    <div className="results-hero-stat">
                      <p className="dashboard-kicker text-[11px]">Risk drag</p>
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
            </div>
          </div>
        </section>
        <div
          className={[
            'scenario-digest-collapse',
            scenarioDigestPanel.open ? 'scenario-digest-collapse-open scenario-digest-collapse-revealed' : '',
            isScenarioDigestExiting ? 'scenario-digest-collapse-exiting' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden={!scenarioDigestPanel.open}
        >
          {isScenarioDigestRendered ? (
            <div key={displayedDigestMode ?? 'scenario-digest'} className="scenario-digest-collapse-inner">
              {displayedDigestMode === 'commercial' ? (
              <section className="scenario-digest-section dashboard-secondary-shell section-shell section-shell-analysis rounded-2xl p-3">
                <div className="scenario-digest-header mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="dashboard-kicker">Commercial outputs</p>
                      <span className="scenario-digest-live-pill">Live from inputs</span>
                    </div>
                    <p className="scenario-digest-title">Commercial underwriting digest</p>
                    <p className="dashboard-meta hidden text-[11px] sm:block">Leasing, risk, debt, and income signals</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      prepareDesktopDigestFlip();
                      setIsCommercialOrderEditorOpen((prev) => !prev);
                    }}
                    className="section-action section-action-analysis rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-slate-200"
                  >
                    {isCommercialOrderEditorOpen ? 'Done' : 'Reorder'}
                  </button>
                </div>
                {isCommercialOrderEditorOpen ? (
                  <div className="dashboard-block mb-2 space-y-1 rounded-lg p-2">
                    {displayedCommercialDigestItems.map((item, index) => (
                      <div key={`order-${item.key}`} className="section-inner-muted flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
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
                            disabled={index === displayedCommercialDigestItems.length - 1}
                            className="h-6 min-w-6 rounded border border-white/15 bg-black/20 px-1 text-[10px] text-slate-200 disabled:opacity-40"
                          >
                            Down
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="scenario-digest-grid grid grid-cols-2 gap-1.5 sm:hidden">
                  {primaryMobileCommercialDigestItems.map((item) => (
                    <DigestMetricCard key={item.key} item={item} variant="mobile" />
                  ))}
                </div>
                {hasHiddenCommercialMobileOutputs ? (
                  <div
                    className={`scenario-digest-extra-grid scenario-digest-grid grid grid-cols-2 gap-1.5 sm:hidden ${
                      displayedShowAllCommercialMobileOutputs ? 'scenario-digest-extra-grid-open' : ''
                    }`}
                    aria-hidden={!displayedShowAllCommercialMobileOutputs}
                  >
                    {additionalMobileCommercialDigestItems.map((item) => (
                      <DigestMetricCard key={item.key} item={item} variant="mobile" />
                    ))}
                  </div>
                ) : null}
                {hasHiddenCommercialMobileOutputs ? (
                  <button
                    type="button"
                    onClick={() => {
                      prepareDesktopDigestFlip();
                      setShowAllCommercialMobileOutputs((prev) => !prev);
                    }}
                    className="section-action section-action-analysis mt-2 w-full rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-200 sm:hidden"
                  >
                    {displayedShowAllCommercialMobileOutputs ? 'Show fewer outputs' : 'Show all outputs'}
                  </button>
                ) : null}
                <div className="scenario-digest-grid hidden gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-5">
                  {displayedCommercialDigestItems.map((item) => (
                    <DigestMetricCard key={item.key} item={item} variant="desktop" />
                  ))}
                </div>
              </section>
            ) : null}
            {displayedDigestMode === 'turnaround' ? (
              <section className="scenario-digest-section dashboard-secondary-shell section-shell section-shell-analysis rounded-2xl p-3">
                <div className="scenario-digest-header mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="dashboard-kicker">Long-term turnaround outputs</p>
                      <span className="scenario-digest-live-pill">Live from inputs</span>
                    </div>
                    <p className="scenario-digest-title">Stabilized run-rate digest</p>
                    <p className="dashboard-meta hidden text-[11px] sm:block">First-year drag separated from stabilized upside</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="section-tag section-tag-analysis">Stabilized</span>
                    <button
                      type="button"
                      onClick={() => {
                        prepareDesktopDigestFlip();
                        setIsLongTermTurnaroundOrderEditorOpen((prev) => !prev);
                      }}
                      className="section-action section-action-analysis rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-slate-200"
                    >
                      {isLongTermTurnaroundOrderEditorOpen ? 'Done' : 'Reorder'}
                    </button>
                  </div>
                </div>
                {isLongTermTurnaroundOrderEditorOpen ? (
                  <div className="dashboard-block mb-2 space-y-1 rounded-lg p-2">
                    {displayedLongTermTurnaroundDigestItems.map((item, index) => (
                      <div key={`lt-order-${item.key}`} className="section-inner-muted flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
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
                            disabled={index === displayedLongTermTurnaroundDigestItems.length - 1}
                            className="h-6 min-w-6 rounded border border-white/15 bg-black/20 px-1 text-[10px] text-slate-200 disabled:opacity-40"
                          >
                            Down
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="scenario-digest-grid grid grid-cols-2 gap-1.5 sm:hidden">
                  {primaryMobileLongTermTurnaroundDigestItems.map((item) => (
                    <DigestMetricCard key={item.key} item={item} variant="mobile" />
                  ))}
                </div>
                {hasHiddenLongTermTurnaroundMobileOutputs ? (
                  <div
                    className={`scenario-digest-extra-grid scenario-digest-grid grid grid-cols-2 gap-1.5 sm:hidden ${
                      displayedShowAllLongTermTurnaroundMobileOutputs ? 'scenario-digest-extra-grid-open' : ''
                    }`}
                    aria-hidden={!displayedShowAllLongTermTurnaroundMobileOutputs}
                  >
                    {additionalMobileLongTermTurnaroundDigestItems.map((item) => (
                      <DigestMetricCard key={item.key} item={item} variant="mobile" />
                    ))}
                  </div>
                ) : null}
                {hasHiddenLongTermTurnaroundMobileOutputs ? (
                  <button
                    type="button"
                    onClick={() => {
                      prepareDesktopDigestFlip();
                      setShowAllLongTermTurnaroundMobileOutputs((prev) => !prev);
                    }}
                    className="section-action section-action-analysis mt-2 w-full rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-200 sm:hidden"
                  >
                    {displayedShowAllLongTermTurnaroundMobileOutputs ? 'Show fewer outputs' : 'Show all outputs'}
                  </button>
                ) : null}
                <div className="scenario-digest-grid hidden gap-2 sm:grid sm:grid-cols-3 lg:grid-cols-4">
                  {displayedLongTermTurnaroundDigestItems.map((item) => (
                    <DigestMetricCard key={item.key} item={item} variant="desktop" />
                  ))}
                </div>
              </section>
            ) : null}
            </div>
          ) : null}
        </div>

        <div ref={desktopPostDigestFlowRef} className="scenario-flip-flow">
          <nav className="desktop-workspace-tabs" aria-label="Desktop workspace sections">
            {([
              ['build', 'Build'],
              ['projection', 'Projection'],
              ['compare', 'Compare']
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={desktopWorkspaceMode === mode}
                className={`desktop-workspace-tab ${desktopWorkspaceMode === mode ? 'desktop-workspace-tab-active' : ''}`}
                onClick={() => {
                  setDesktopWorkspaceMode(mode);
                }}
              >
                {label}
              </button>
            ))}
          </nav>

          {desktopWorkspaceMode === 'build' ? (
          <section className="desktop-deal-builder section-shell section-shell-input min-w-0 rounded-[1.7rem] p-4 shadow-soft xl:p-5 [overflow-anchor:none]">
            <div ref={desktopStrategyTabsRef} className="desktop-builder-strategy-row">
              <StrategyTabs
                active={activeStrategy}
                onChange={openDesktopStrategyWorkspace}
                longTermTurnaroundEnabled={model.longTerm.turnaround.enabled}
                onLongTermTurnaroundChange={setLongTermTurnaroundEnabled}
                quickScan={strategyQuickScan}
                embeddedInRail
                actionSlot={
                  <button
                    type="button"
                    onClick={() => {
                      triggerHapticFeedback('light');
                      setIsStrategyWorkOpen(true);
                    }}
                    className="btn-primary btn-spotlight btn-brand-profile tap-feedback flex h-full min-h-[2.35rem] items-center justify-center rounded-xl px-3 py-1.5 text-[0.8125rem] font-medium whitespace-nowrap"
                  >
                    Show work
                  </button>
                }
              />
            </div>

            <nav className="desktop-input-section-tabs" aria-label="Deal input sections">
              {compactInputSections.map((section) => (
                <button
                  key={`desktop-input-${section.key}`}
                  type="button"
                  aria-pressed={desktopInputSection === section.key}
                  className={`desktop-input-section-tab ${desktopInputSection === section.key ? 'desktop-input-section-tab-active' : ''}`}
                  onClick={() => setDesktopInputSection(section.key)}
                >
                  <span>{section.label === 'Core' ? 'Deal basics' : section.label === 'IRR' ? 'Advanced' : section.label}</span>
                  <small>{section.summary}</small>
                </button>
              ))}
            </nav>

            <div className="desktop-progressive-input-shell w-full">
              {desktopInputSection === 'core' ? (
                <div ref={desktopCoreSectionRef} className="desktop-builder-lane">
                  <DealInputPanel
                    value={model}
                    onChange={updateModel}
                    resolveListingDealName={resolveListingDealName}
                    defaultAdvancedOptionsOpen={false}
                    forcedCoreSection="purchaseFinancing"
                    titleOverride="Deal basics"
                    contentViewportClassName={desktopInputViewportClassName}
                    variant="embedded"
                  />
                </div>
              ) : null}
              {desktopInputSection === 'strategy' ? (
                <div ref={desktopStrategyInputsRef} className="desktop-builder-lane">
                  <StrategyInputsWorkspace activeStrategy={activeStrategy} model={model} onChange={updateModel} embedded />
                </div>
              ) : null}
              {desktopInputSection === 'expenses' ? (
                <div ref={desktopExpensesSectionRef} className="desktop-builder-lane">
                  <DealInputPanel
                    value={model}
                    onChange={updateModel}
                    resolveListingDealName={resolveListingDealName}
                    defaultAdvancedOptionsOpen={false}
                    forcedCoreSection="expenses"
                    contentViewportClassName={desktopInputViewportClassName}
                    variant="embedded"
                  />
                </div>
              ) : null}
              {desktopInputSection === 'irr' ? (
                <div ref={irrStreamRef} className="desktop-builder-lane desktop-builder-lane-advanced">
                  <TimelineCard
                    output={result[activeStrategy]}
                    assumptions={model.assumptions}
                    defaultOpen
                    collapsible={false}
                    summaryVariant="compact"
                    onAssumptionsChange={updateAssumptions}
                    showTargetIrrInput={showTargetIrrInput}
                    layoutVariant="strip"
                  />
                </div>
              ) : null}
            </div>
          </section>
          ) : null}

          {desktopWorkspaceMode !== 'build' ? (
            <section ref={desktopCompareSectionRef} className="desktop-analysis-dock [overflow-anchor:none]">
              {!compactReadiness.ready ? (
                <div className="section-shell decision-empty-state rounded-[1.1rem] p-5" aria-live="polite">
                  <span className="decision-status decision-status-incomplete">Incomplete inputs</span>
                  <h2 className="decision-empty-title mt-4 text-xl font-semibold">Add the deal basics first</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{incompleteDecisionDescription}</p>
                  <p className="mt-3 text-xs leading-relaxed text-muted">
                    Still needed: {compactReadiness.missing.join(', ')}. DealCooker will hold back zero-value projections until the comparison is meaningful.
                  </p>
                  <button
                    type="button"
                    className="btn-primary mt-5 min-h-11 rounded-xl px-4 py-2 text-sm font-semibold"
                    onClick={() => {
                      setDesktopWorkspaceMode('build');
                      setDesktopInputSection('core');
                    }}
                  >
                    Complete inputs
                  </button>
                </div>
              ) : (
                <>
                  <div className="desktop-analysis-grid">
                    <div className="desktop-analysis-projections min-w-0">{desktopPerformanceDashboard}</div>
                    {desktopWorkspaceMode === 'projection' ? (
                      <div ref={irrStreamRef} className="desktop-analysis-timeline min-w-0">
                        <TimelineCard
                          output={result[activeStrategy]}
                          assumptions={model.assumptions}
                          defaultOpen={Boolean(activeDealId)}
                          collapsible={false}
                          summaryVariant="compact"
                          onAssumptionsChange={updateAssumptions}
                          showTargetIrrInput={showTargetIrrInput}
                          layoutVariant="strip"
                        />
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </section>
          ) : null}
        </div>
        </>
        ) : null}
      </div>
      <div className="lg:pt-3">
        <footer className="app-footer section-shell section-shell-utility rounded-2xl p-4 text-xs text-muted">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>&copy; 2026 Dillon Cook. DealCooker is a product created by Dillon Cook. All rights reserved.</p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/help" className="hover:text-accent">Help</Link>
              <Link href="/legal" className="hover:text-accent">Legal Center</Link>
              <Link href="/legal/terms" className="hover:text-accent">Terms</Link>
              <Link href="/legal/privacy" className="hover:text-accent">Privacy</Link>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted/90">
            For educational and informational purposes only. Not financial, legal, tax, or investment advice.
          </p>
        </footer>
      </div>

      {dealIdentitySheet}
      {desktopDealVaultSheet}
      {feedbackReminderDialog}
      {feedbackComposerDialog}
      {dealReviewDialog}

      <OnboardingTour
        open={isOnboardingOpen}
        steps={currentOnboardingSteps}
        stepIndex={onboardingStepIndex}
        layoutKey={onboardingTargetLayoutKey}
        getTargetElement={resolveOnboardingTarget}
        onBack={goToPreviousOnboardingStep}
        onNext={goToNextOnboardingStep}
        onSkip={completeOnboarding}
      />
      <StrategyWorkLightbox
        open={isStrategyWorkOpen}
        activeStrategy={activeStrategy}
        output={activeOutput}
        input={model}
        presentation={isMobileViewport ? 'sheet' : 'modal'}
        onClose={() => setIsStrategyWorkOpen(false)}
      />
      {workspaceViewMode === 'studio' ? compactModeNavPortal : null}
    </main>
  );
}


