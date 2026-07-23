import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

const analyticsSource = readFileSync(resolve(process.cwd(), 'landing/assets/analytics.js'), 'utf8');
const builderSource = readFileSync(resolve(process.cwd(), 'scripts/build-landing.ts'), 'utf8');
const headersSource = readFileSync(resolve(process.cwd(), 'landing/_headers'), 'utf8');
const privacySource = readFileSync(resolve(process.cwd(), 'app/legal/privacy/page.tsx'), 'utf8');
const layoutSource = readFileSync(resolve(process.cwd(), 'app/layout.tsx'), 'utf8');

test('Deal Cooker marketing pages load only their dedicated GA4 stream', () => {
  assert.match(analyticsSource, /G-32WWGD9XGQ/);
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
  assert.doesNotMatch(layoutSource, /GoogleAnalytics/);
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
