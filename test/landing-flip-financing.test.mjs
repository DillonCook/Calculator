import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const file = 'fix-and-flip-calculator/index.html';
const read = relative => fs.readFileSync(path.join('landing-dist', relative), 'utf8');
const description = 'Check hard-money points, minimum interest and holding costs in a free fix-and-flip analysis. Understand the full-balance model before comparing a lender quote.';
const oldDescription = 'Analyze a fix-and-flip for free with rehab contingency, hard-money interest and points, holding costs, selling costs, profit, ROI, and max allowable offer.';

test('flip visitors can reconcile a hard-money quote with the existing simplified financing model', () => {
  const document = new JSDOM(read(file)).window.document;
  const guide = document.querySelector('#flip-financing-guide');
  assert.ok(guide, 'the flip page needs an explicit quote-to-model financing guide');
  assert.equal(guide.getAttribute('aria-labelledby'), 'flip-financing-heading');
  assert.equal(guide.querySelector('h2').textContent, 'Hard-money flip costs: check the loan, not just the rate');
  for (const phrase of [
    'One point is one percent of the loan amount, not the purchase price.',
    'does not automatically reduce the entered interest rate',
    'purchase price plus rehab including contingency',
    'full modeled loan balance',
    'longer of your holding period and the minimum-interest months',
    'does not model a staged rehab draw schedule',
    'not a lender recommendation',
    'not a guarantee of cash savings',
    'Do not add a second copy of modeled interest',
    'Property taxes, insurance and applicable fixed or variable costs',
    'loan extensions, draw fees and payoff charges',
    'pre-tax estimates, not a lender quote',
    'References checked November 17, 2026'
  ]) assert.ok(guide.textContent.includes(phrase), `missing actionable context: ${phrase}`);
  assert.deepEqual([...guide.querySelectorAll('a')].map(a => a.getAttribute('href')), [
    'https://www.consumerfinance.gov/ask-cfpb/what-are-discount-points-and-lender-credits-and-how-do-they-work-en-136/',
    'https://lendingone.com/loan-types/fix-and-flip-loans',
    '#worked-example',
    'https://www.dealcooker.app/?utm_source=dealcooker_landing&utm_medium=organic&utm_campaign=seo_strategy_page&utm_content=flip&strategy=flip'
  ]);
  assert.ok(document.querySelector('#worked-example'));
  assert.ok([...guide.querySelectorAll('a[rel="external"]')].length === 2);
  assert.ok(document.querySelector('.hero-actions a[href="#worked-example"]'));
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) assert.equal(document.querySelector(selector)?.content, description);
  assert.equal(document.querySelector('time').dateTime, '2026-11-17');
  const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent));
  assert.equal(schemas.find(s => s['@type'] === 'WebPage').dateModified, '2026-11-17');
  assert.match(read('sitemap.xml'), /<loc>https:\/\/dealcooker.app\/fix-and-flip-calculator\/<\/loc><lastmod>2026-11-17<\/lastmod>/);
});

test('flip guide preserves all existing examples, other public bytes and private indexing', { skip: !process.env.LANDING_FLIP_BASELINE }, () => {
  const baseline = path.resolve(process.env.LANDING_FLIP_BASELINE);
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
      const reverted = after.toString().replace(/<section id="flip-financing-guide"[\s\S]*?<\/section>\n/, '').replaceAll(description, oldDescription).replaceAll('2026-11-17', '2026-07-24');
      assert.equal(reverted, before.toString(), 'only selected guide/description/flip date may change');
    } else if (relative === 'sitemap.xml') {
      assert.equal(after.toString().replace('<loc>https://dealcooker.app/fix-and-flip-calculator/</loc><lastmod>2026-11-17</lastmod>', '<loc>https://dealcooker.app/fix-and-flip-calculator/</loc><lastmod>2026-07-24</lastmod>'), before.toString());
    } else assert.deepEqual(after, before, `${relative} must remain byte-identical`);
  }
});
