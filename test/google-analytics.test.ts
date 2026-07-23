import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

const analyticsSource = readFileSync(resolve(process.cwd(), 'components/google-analytics.tsx'), 'utf8');
const layoutSource = readFileSync(resolve(process.cwd(), 'app/layout.tsx'), 'utf8');
const privacySource = readFileSync(resolve(process.cwd(), 'app/legal/privacy/page.tsx'), 'utf8');

test('Deal Cooker loads only its dedicated GA4 stream', () => {
  assert.match(analyticsSource, /G-32WWGD9XGQ/);
  assert.match(analyticsSource, /googletagmanager\.com\/gtag\/js/);
  assert.doesNotMatch(analyticsSource, /G-2NFL5W5T7D|G-3P80XDL65G|G-76928X03KB/);
  assert.match(layoutSource, /GoogleAnalytics/);
});

test('Deal Cooker automated QA is analytics-silent unless explicitly forced', () => {
  assert.match(analyticsSource, /__dealcookerGaLoaded/);
  assert.match(analyticsSource, /navigator\.webdriver/);
  assert.match(analyticsSource, /dc_qa/);
  assert.match(analyticsSource, /dc_analytics/);
  assert.match(analyticsSource, /force/);
});

test('Deal Cooker privacy notice discloses Google Analytics', () => {
  assert.match(privacySource, /Google Analytics/);
  assert.match(privacySource, /unique visitors/i);
});
