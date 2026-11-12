import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

function bootAppAnalytics(url: string, webdriver = false) {
  const location = new URL(url);
  const scripts: { src?: string }[] = [];
  const window = {
    location,
    history: {
      pushState(_state: unknown, _title: string, next: string) { location.href = new URL(next, location).href; },
      replaceState(_state: unknown, _title: string, next: string) { location.href = new URL(next, location).href; },
    },
    addEventListener() {},
    dataLayer: [] as unknown[][],
  } as {
    location: URL;
    history: { pushState: (state: unknown, title: string, next: string) => void; replaceState: (state: unknown, title: string, next: string) => void };
    addEventListener: () => void;
    dataLayer: unknown[][];
    [key: string]: unknown;
  };
  const document = { title: 'DealCooker', createElement: () => ({}), head: { appendChild: (script: { src?: string }) => scripts.push(script) } };
  const source = appAnalyticsSource.match(/const bootstrap = `([\s\S]*?)`;/)?.[1];
  assert.ok(source);
  runInNewContext(source.replace('${DEAL_COOKER_MEASUREMENT_ID}', 'G-30FBLB4LFQ'), { window, document, navigator: { webdriver }, URLSearchParams, URL });
  return { window, scripts, events: () => window.dataLayer.map((row: unknown[]) => Array.from(row)) };
}

const landingEntry = 'https://www.dealcooker.app/?utm_source=dealcooker_landing&utm_medium=organic&utm_campaign=homepage_cta&utm_content=hero';

test('real marketing CTA starts exactly one sanitized app pageview before query cleanup', () => {
  const app = bootAppAnalytics(landingEntry);
  assert.equal(app.scripts.length, 1);
  app.window.history.replaceState(null, '', '/');
  assert.equal(app.events().filter((row: unknown[]) => row[0] === 'event' && row[1] === 'page_view').length, 1);
  const config = app.events().find((row: unknown[]) => row[0] === 'config')?.[2] as Record<string, unknown>;
  assert.equal(config.page_location, 'https://www.dealcooker.app/');
  assert.equal(config.page_referrer, '');
  assert.equal(JSON.stringify(app.events()).includes('utm_'), false);
});

test('marketing entry preserves QA suppression and private URL rejection', () => {
  for (const query of ['&dc_qa=1', '&dc_analytics=off', '&email=private@example.invalid', '&code=secret', '&deal=private', '&utm_source=duplicate', '&strategy=unknown']) {
    assert.equal(bootAppAnalytics(landingEntry + query).scripts.length, 0, query);
  }
  assert.equal(bootAppAnalytics(landingEntry, true).scripts.length, 0);
  assert.equal(bootAppAnalytics(landingEntry + '&dc_analytics=force', true).scripts.length, 1);
  assert.equal(bootAppAnalytics(landingEntry + '#private').scripts.length, 0);
  assert.equal(bootAppAnalytics(landingEntry.replace('/?', '/auth/callback?') + '&dc_analytics=force').scripts.length, 0);
  assert.equal(bootAppAnalytics(landingEntry.replace('dealcooker_landing', 'unreviewed')).scripts.length, 0);
});

test('strategy handoff is sanitized and private SPA transitions disable collection', () => {
  const app = bootAppAnalytics(landingEntry.replace('homepage_cta', 'seo_strategy_page') + '&strategy=longTerm');
  assert.equal(app.scripts.length, 1);
  assert.equal(JSON.stringify(app.events()).includes('longTerm'), false);
  app.window.history.pushState(null, '', '/?deal=private');
  assert.equal(app.window['ga-disable-G-30FBLB4LFQ'], true);
  app.window.history.replaceState(null, '', '/');
  assert.equal(app.window['ga-disable-G-30FBLB4LFQ'], false);
  assert.equal(app.events().filter((row) => row[0] === 'event' && row[1] === 'page_view').length, 1);
});

const analyticsSource = readFileSync(resolve(process.cwd(), 'landing/assets/analytics.js'), 'utf8');
const appAnalyticsSource = readFileSync(resolve(process.cwd(), 'components/google-analytics.tsx'), 'utf8');
const builderSource = readFileSync(resolve(process.cwd(), 'scripts/build-landing.ts'), 'utf8');
const headersSource = readFileSync(resolve(process.cwd(), 'landing/_headers'), 'utf8');
const privacySource = readFileSync(resolve(process.cwd(), 'app/legal/privacy/page.tsx'), 'utf8');
const layoutSource = readFileSync(resolve(process.cwd(), 'app/layout.tsx'), 'utf8');

test('Deal Cooker marketing pages load only their dedicated GA4 stream', () => {
  assert.match(analyticsSource, /G-30FBLB4LFQ/);
  assert.match(analyticsSource, /googletagmanager\.com\/gtag\/js/);
  assert.doesNotMatch(analyticsSource, /G-2NFL5W5T7D|G-3P80XDL65G|G-76928X03KB|G-R4C1061XNG/);
  assert.match(builderSource, /assets\/analytics\.js/);
});

test('Deal Cooker automated QA is analytics-silent unless explicitly forced', () => {
  assert.match(analyticsSource, /__dealcookerGaLoaded/);
  assert.match(analyticsSource, /navigator\.webdriver/);
  assert.match(analyticsSource, /dc_qa/);
  assert.match(analyticsSource, /dc_analytics/);
  assert.match(analyticsSource, /force/);
});

test('Deal Cooker sends only sanitized marketing page locations', () => {
  assert.match(analyticsSource, /send_page_view:\s*false/);
  assert.match(analyticsSource, /page_location:\s*window\.location\.origin\s*\+\s*safePath/);
  assert.match(analyticsSource, /page_path:\s*safePath/);
  assert.doesNotMatch(analyticsSource, /page_location:\s*window\.location\.href/);
});

test('Deal Cooker app tracking is allowlisted and never sends deal or auth URLs', () => {
  assert.match(appAnalyticsSource, /send_page_view:\s*false/);
  assert.match(appAnalyticsSource, /safePaths\s*=\s*new Set\(\['\/', '\/legal\/privacy'\]\)/);
  assert.match(appAnalyticsSource, /page_location:\s*window\.location\.origin\s*\+\s*safePath/);
  assert.match(appAnalyticsSource, /page_referrer:\s*''/);
  assert.doesNotMatch(appAnalyticsSource, /page_location:\s*window\.location\.href/);
  assert.match(layoutSource, /GoogleAnalytics/);
});

test('Deal Cooker landing CSP permits the minimal GA4 endpoints', () => {
  assert.match(headersSource, /script-src[^\n]+https:\/\/www\.googletagmanager\.com/);
  assert.match(headersSource, /connect-src[^\n]+https:\/\/\*\.google-analytics\.com/);
  assert.match(headersSource, /img-src[^\n]+https:\/\/\*\.google-analytics\.com/);
  assert.match(headersSource, /frame-ancestors 'none'/);
});

test('Deal Cooker privacy notice discloses Google Analytics', () => {
  assert.match(privacySource, /Google Analytics/);
  assert.match(privacySource, /unique visitors/i);
});
