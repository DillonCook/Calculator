import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const file = 'brrrr-calculator/index.html';
const read = relative => fs.readFileSync(path.join('landing-dist', relative), 'utf8');
const description = 'Model BRRRR refinance proceeds after debt payoff and costs. Separate cash left from upfront funding, then check appraisal, timing and lender limits.';
const oldDescription = 'Model a BRRRR deal for free from purchase and rehab through refinance, cash returned, post-refi cash flow, equity, ROI, and long-term IRR.';

test('BRRRR visitors can separate modeled refinance proceeds, funding needs and loan eligibility', () => {
  const document = new JSDOM(read(file)).window.document;
  const guide = document.querySelector('#brrrr-refinance-guide');
  assert.ok(guide, 'BRRRR needs an explicit net-proceeds and refinance-eligibility walkthrough');
  assert.equal(guide.getAttribute('aria-labelledby'), 'brrrr-refinance-heading');
  assert.equal(guide.querySelector('h2').textContent, 'BRRRR refinance: loan amount is not cash returned');
  for (const phrase of [
    'assumed after-repair value multiplied by your refinance LTV',
    'subtracts modeled refinance closing costs and the remaining acquisition debt payoff',
    'negative net proceeds mean additional cash is needed',
    'Cash left after refinance is not the cash needed to buy and renovate',
    'zero cash left does not mean zero upfront funding',
    'cash-on-cash return as zero, not an infinite return',
    'does not underwrite loan eligibility or enforce lender seasoning rules',
    'six-month ownership requirement and a separate twelve-month age requirement',
    'delayed-financing exception has additional documentation and loan-amount limits',
    'not universal BRRRR loan terms',
    'refinance timing is beyond the modeled hold period, the refinance does not occur',
    'lower appraised value and a later refinance',
    'References checked November 18, 2026'
  ]) assert.ok(guide.textContent.includes(phrase), `missing refinance guidance: ${phrase}`);
  assert.deepEqual([...guide.querySelectorAll('a')].map(a => a.getAttribute('href')), [
    'https://www.consumerfinance.gov/ask-cfpb/what-is-a-loan-to-value-ratio-and-how-does-it-relate-to-my-costs-en-121/',
    'https://selling-guide.fanniemae.com/sel/b2-1.3-03/cash-out-refinance-transactions',
    '#worked-example',
    'https://www.dealcooker.app/?utm_source=dealcooker_landing&utm_medium=organic&utm_campaign=seo_strategy_page&utm_content=brrrr&strategy=brrrr'
  ]);
  assert.ok(document.querySelector('.hero-actions a[href="#worked-example"]'));
  assert.ok(document.querySelector('#worked-example'));
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) assert.equal(document.querySelector(selector)?.content, description);
  assert.equal(document.querySelector('time').dateTime, '2026-11-18');
  const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent));
  assert.equal(schemas.find(s => s['@type'] === 'WebPage').dateModified, '2026-11-18');
  assert.match(read('sitemap.xml'), /<loc>https:\/\/dealcooker.app\/brrrr-calculator\/<\/loc><lastmod>2026-11-18<\/lastmod>/);
});

test('BRRRR guide preserves every original example, other public byte and private indexing', { skip: !process.env.LANDING_BRRRR_BASELINE }, () => {
  const baseline = path.resolve(process.env.LANDING_BRRRR_BASELINE);
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
      const reverted = after.toString().replace(/<section id="brrrr-refinance-guide"[\s\S]*?<\/section>\n/, '').replaceAll(description, oldDescription).replaceAll('2026-11-18', '2026-07-24');
      assert.equal(reverted, before.toString(), 'only selected guide/description/BRRRR dates may change');
    } else if (relative === 'sitemap.xml') {
      assert.equal(after.toString().replace('<loc>https://dealcooker.app/brrrr-calculator/</loc><lastmod>2026-11-18</lastmod>', '<loc>https://dealcooker.app/brrrr-calculator/</loc><lastmod>2026-07-24</lastmod>'), before.toString());
    } else assert.deepEqual(after, before, `${relative} must remain byte-identical`);
  }
});
