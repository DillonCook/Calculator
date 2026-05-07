import { getSupabaseClient } from '@/lib/supabaseClient';

export type AnalyticsEventName =
  | 'app_opened'
  | 'deal_review_requested'
  | 'feedback_sent'
  | 'pwa_installed'
  | 'pwa_install_prompt_accepted'
  | 'pwa_install_prompt_available'
  | 'pwa_install_prompt_dismissed'
  | 'pwa_install_prompt_requested'
  | 'pwa_install_prompt_shown'
  | 'scenario_created'
  | 'scenario_deleted'
  | 'scenario_duplicated'
  | 'scenario_imported'
  | 'scenario_sample_loaded'
  | 'share_link_created'
  | 'share_link_open_failed'
  | 'share_link_opened'
  | 'strategy_selected'
  | 'print_opened';

type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

const ANONYMOUS_ID_STORAGE_KEY = 'dealcooker.analytics.anonymous-id:v1';
const SESSION_ID_STORAGE_KEY = 'dealcooker.analytics.session-id:v1';
const appReleaseLabel = process.env.NEXT_PUBLIC_APP_RELEASE ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'local-open-testing';

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

const readOrCreateStoredId = (storage: Storage, key: string) => {
  const existing = storage.getItem(key);
  if (existing) return existing;

  const nextId = createId();
  storage.setItem(key, nextId);
  return nextId;
};

const readDisplayMode = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'browser';
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true ? 'standalone' : 'browser';
};

const sanitizeProperties = (properties: AnalyticsProperties = {}) =>
  Object.fromEntries(
    Object.entries(properties)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key.slice(0, 80), typeof value === 'string' ? value.slice(0, 220) : value])
  );

export const trackAnalyticsEvent = async (eventName: AnalyticsEventName, properties?: AnalyticsProperties) => {
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV === 'test') return;

  let anonymousId: string | null = null;
  let sessionId: string | null = null;

  try {
    anonymousId = readOrCreateStoredId(window.localStorage, ANONYMOUS_ID_STORAGE_KEY);
    sessionId = readOrCreateStoredId(window.sessionStorage, SESSION_ID_STORAGE_KEY);
  } catch {
    anonymousId = null;
    sessionId = null;
  }

  const payload = {
    eventName,
    anonymousId,
    sessionId,
    route: window.location.pathname,
    release: appReleaseLabel,
    properties: {
      displayMode: readDisplayMode(),
      viewport: window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
      ...sanitizeProperties(properties)
    }
  };

  try {
    const supabase = getSupabaseClient();
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
    const accessToken = data.session?.access_token;

    await fetch('/api/analytics/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify(payload),
      keepalive: true
    });
  } catch {
    // Analytics must never interrupt the underwriting workflow.
  }
};
