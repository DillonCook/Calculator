import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const file = 'airbnb-investment-calculator/index.html';
const read = relative => fs.readFileSync(path.join('landing-dist', relative), 'utf8');
const description = 'Estimate Airbnb cash flow from gross booking revenue, not just payouts. Separate cleaning charges, cleaner costs and host fees, then inspect the free worked example.';
const oldDescription = 'Analyze an Airbnb or short-term rental for free using nightly rate, occupancy, stay length, cleaning, platform fees, management, reserves, ROI, and IRR.';

test('Airbnb visitors can map gross revenue rather than a net payout into either existing input mode', () => {
  const document = new JSDOM(read(file)).window.document;
  const guide = document.querySelector('#airbnb-revenue-guide');
  assert.ok(guide, 'the Airbnb page needs a gross-revenue versus payout input guide');
  assert.equal(guide.getAttribute('aria-labelledby'), 'airbnb-revenue-heading');
  assert.equal(guide.querySelector('h2').textContent, 'Airbnb revenue is not the same as your payout');
  for (const phrase of [
    'Do not enter a net payout and then deduct the same host fees again.',
    'ADR', 'Nights per month', 'Occupancy %', 'Avg nights per booking',
    'Cleaning fee charged', 'Cleaner cost / turn', 'Annual revenue (optional)',
    'including cleaning charges, before host fees and excluding taxes',
    'replaces nightly revenue and cleaning revenue; cleaning charges are not added again',
    'Occupancy and stay length still determine cleaner costs',
    'Platform fee %', 'room revenue plus cleaning charges',
    'Management and reserve percentages use room revenue in nightly mode, but the supplied gross revenue in override mode.',
    'not a bank-deposit reconciliation', 'Reference checked November 16, 2026'
  ]) assert.ok(guide.textContent.includes(phrase), `missing actionable context: ${phrase}`);
  assert.deepEqual([...guide.querySelectorAll('a')].map(a => a.getAttribute('href')), [
    'https://www.airbnb.com/help/article/459', 'https://www.airbnb.com/help/article/1857',
    '#worked-example',
    'https://www.dealcooker.app/?utm_source=dealcooker_landing&utm_medium=organic&utm_campaign=seo_strategy_page&utm_content=airbnb&strategy=airbnb'
  ]);
  assert.ok(document.querySelector(guide.querySelector('a[href^="#"]').getAttribute('href')));
  assert.ok([...guide.querySelectorAll('a[href^="https://www.airbnb.com/"]')].every(a => a.rel === 'external'));
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) assert.equal(document.querySelector(selector)?.content, description);
  assert.equal(document.querySelector('time').dateTime, '2026-11-16');
  const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent));
  assert.equal(schemas.find(s => s['@type'] === 'WebPage').dateModified, '2026-11-16');
  assert.match(read('sitemap.xml'), /<loc>https:\/\/dealcooker.app\/airbnb-investment-calculator\/<\/loc><lastmod>2026-11-16<\/lastmod>/);
});

test('Airbnb guide preserves worked examples, other pages, assets and private indexing', { skip: !process.env.LANDING_AIRBNB_BASELINE }, () => {
  const baseline = path.resolve(process.env.LANDING_AIRBNB_BASELINE);
  const walk = (root, directory = '') => fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const relative = directory ? `${directory}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(root, relative) : [relative];
  });
  const files = walk(baseline).sort();
  assert.deepEqual(walk('landing-dist').sort(), files, 'no public/private path or asset additions');
  for (const relative of files) {
    const before = fs.readFileSync(path.join(baseline, relative));
    const after = fs.readFileSync(path.join('landing-dist', relative));
    if (relative === file) {
      const reverted = after.toString().replace(/<section id="airbnb-revenue-guide"[\s\S]*?<\/section>\n/, '').replaceAll(description, oldDescription).replaceAll('2026-11-16', '2026-09-12');
      assert.equal(reverted, before.toString(), 'only selected guide/description/Airbnb date may change');
    } else if (relative === 'sitemap.xml') {
      assert.equal(after.toString().replace('<loc>https://dealcooker.app/airbnb-investment-calculator/</loc><lastmod>2026-11-16</lastmod>', '<loc>https://dealcooker.app/airbnb-investment-calculator/</loc><lastmod>2026-09-12</lastmod>'), before.toString());
    } else assert.deepEqual(after, before, `${relative} must remain byte-identical`);
  }
});
