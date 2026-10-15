import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { getSession, getClient } = vi.hoisted(() => {
  const getSession = vi.fn(async () => ({ data: { session: null } }));
  return { getSession, getClient: vi.fn(() => ({ auth: { getSession } })) };
});
vi.mock('@/lib/supabaseClient', () => ({ getSupabaseClient: getClient }));

const browserWindow = window;
const fetchEvent = vi.fn(async () => new Response(null, { status: 204 }));
const visit = (url: string, webdriver = false) => {
  vi.stubGlobal('window', {
    location: new URL(url),
    localStorage: browserWindow.localStorage,
    sessionStorage: browserWindow.sessionStorage,
    navigator: { webdriver },
    innerWidth: 1280,
    matchMedia: () => ({ matches: false })
  });
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubGlobal('fetch', fetchEvent);
  browserWindow.localStorage.clear();
  browserWindow.sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('QA app entry sends no generic analytics and creates no tracking IDs', async () => {
  visit('https://www.dealcooker.app/?dc_qa=1&dc_analytics=off');
  const { trackAnalyticsEvent } = await import('@/lib/analytics');
  await trackAnalyticsEvent('app_opened');
  expect(fetchEvent).not.toHaveBeenCalled();
  expect(getClient).not.toHaveBeenCalled();
  expect(browserWindow.localStorage.length).toBe(0);
});

it('remains silent when a QA entry URL is cleaned before the first event', async () => {
  visit('https://www.dealcooker.app/?dc_qa=1&dc_analytics=off');
  const { trackAnalyticsEvent } = await import('@/lib/analytics');
  visit('https://www.dealcooker.app/?strategy=longTerm');
  await trackAnalyticsEvent('app_opened');
  expect(fetchEvent).not.toHaveBeenCalled();
  expect(getClient).not.toHaveBeenCalled();
  expect(browserWindow.localStorage.length).toBe(0);
});

it('latches later QA navigation for the remainder of the loaded page', async () => {
  visit('https://www.dealcooker.app/');
  const { trackAnalyticsEvent } = await import('@/lib/analytics');
  visit('https://www.dealcooker.app/?dc_qa=1');
  await trackAnalyticsEvent('app_opened');
  visit('https://www.dealcooker.app/');
  await trackAnalyticsEvent('print_opened');
  expect(fetchEvent).not.toHaveBeenCalled();
  expect(getClient).not.toHaveBeenCalled();
});

it('does not send an in-flight event if navigation enters QA during auth lookup', async () => {
  visit('https://www.dealcooker.app/');
  getSession.mockImplementationOnce(async () => {
    visit('https://www.dealcooker.app/?dc_qa=1');
    return { data: { session: null } };
  });
  const { trackAnalyticsEvent } = await import('@/lib/analytics');
  await trackAnalyticsEvent('app_opened');
  expect(getSession).toHaveBeenCalledOnce();
  expect(fetchEvent).not.toHaveBeenCalled();
});

it.each([
  'https://www.dealcooker.app/',
  'https://www.dealcooker.app/?strategy=longTerm&utm_source=example',
  'https://www.dealcooker.app/?share=synthetic-private-link'
])('preserves ordinary production event delivery at %s without leaking query strings', async url => {
  visit(url);
  const { trackAnalyticsEvent } = await import('@/lib/analytics');
  await trackAnalyticsEvent('strategy_selected', { strategy: 'longTerm', omitted: undefined, label: 'x'.repeat(250) });
  expect(getSession).toHaveBeenCalledOnce();
  expect(fetchEvent).toHaveBeenCalledOnce();
  const [endpoint, options] = fetchEvent.mock.calls[0] as unknown as [string, RequestInit];
  expect(endpoint).toBe('/api/analytics/events');
  expect(options.method).toBe('POST');
  expect(options.keepalive).toBe(true);
  expect(JSON.parse(String(options.body))).toEqual({
    eventName: 'strategy_selected',
    anonymousId: expect.any(String),
    sessionId: expect.any(String),
    route: '/',
    release: expect.any(String),
    properties: { displayMode: 'browser', viewport: 'desktop', strategy: 'longTerm', label: 'x'.repeat(220) }
  });
});

it('keeps test-environment events silent', async () => {
  visit('https://www.dealcooker.app/');
  vi.stubEnv('NODE_ENV', 'test');
  const { trackAnalyticsEvent } = await import('@/lib/analytics');
  await trackAnalyticsEvent('app_opened');
  expect(fetchEvent).not.toHaveBeenCalled();
  expect(getClient).not.toHaveBeenCalled();
});

it('can be imported and called during server rendering without browser APIs', async () => {
  vi.stubGlobal('window', undefined);
  const { trackAnalyticsEvent } = await import('@/lib/analytics');
  await expect(trackAnalyticsEvent('app_opened')).resolves.toBeUndefined();
  expect(fetchEvent).not.toHaveBeenCalled();
  expect(getClient).not.toHaveBeenCalled();
});

it.each([
  ['https://www.dealcooker.app/?dc_qa=1', false],
  ['https://www.dealcooker.app/?dc_analytics=off', false],
  ['https://www.dealcooker.app/?qa=review', false],
  ['https://www.dealcooker.app/', true],
  ['http://localhost:3027/', false],
  ['http://127.0.0.1:3027/', false],
  ['https://calculator-preview.vercel.app/', false]
])('non-user context %s sends no generic events', async (url, webdriver) => {
  visit(url, webdriver);
  const { trackAnalyticsEvent } = await import('@/lib/analytics');
  await trackAnalyticsEvent('scenario_created');
  expect(fetchEvent).not.toHaveBeenCalled();
  expect(getClient).not.toHaveBeenCalled();
  expect(browserWindow.localStorage.length).toBe(0);
  expect(browserWindow.sessionStorage.length).toBe(0);
});
