import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const file = 'methodology/index.html';
const description = "Understand NOI vs cash flow and cap rate vs cash-on-cash return. Read DealCooker's metric definitions, model limits and worked rental examples.";
const oldDescription = 'See how DealCooker calculates NOI, cash flow, cap rate, DSCR, cash-on-cash return, ROI, and IRR across real estate strategies.';
const read = relative => fs.readFileSync(path.join('landing-dist', relative), 'utf8');
const normalize = value => value.replace(/\s+/g, ' ').trim();
const blocks = [
  'NOI vs cash flow; cap rate vs cash-on-cash return',
  'These numbers answer different questions. Start with the property’s operations, then its debt payments, then the cash you have invested. A favorable percentage alone does not make a deal affordable or a forecast reliable.',
  'NOI: does the property cover its operating costs?',
  'Use modeled NOI to inspect income after vacancy and operating costs, before debt service. Positive NOI is not the cash left after paying the loan.',
  'Cash flow: what remains after debt service?',
  'Use monthly cash flow to inspect the modeled operating surplus or shortfall after required debt payments. Check whether reserves are included; repairs and vacancies do not arrive evenly each month.',
  'Cap rate: how does NOI compare with the property basis?',
  'Use cap rate to relate annual modeled NOI to the strategy’s property basis, not to your down payment. It does not tell you your cash return after the loan payments.',
  'Cash-on-cash return: what does the invested cash produce?',
  'Compare annual pre-tax cash flow with modeled cash invested. Inspect that cash amount, not just the down payment: closing costs and project cash can also matter. A larger down payment changes both debt service and invested cash, so do not assume it improves the percentage.',
  'Keep the model boundaries in view',
  'DealCooker’s NOI may include reserves and financing-dependent fixed costs such as PMI. Its cap rate is therefore not necessarily a conventional unlevered cap rate. Most acquisition views use purchase price as the basis; BRRRR uses ARV. Compare like definitions and periods, not just labels.',
  'Read a rental result in this order',
  'Check the income, expenses and reserves behind NOI, then the loan payments behind cash flow.',
  'Review cash invested alongside cash-on-cash return. For BRRRR, distinguish starting cash from cash left after refinance.',
  'Review the hold period, exit assumptions, ROI and IRR. Cash-on-cash return alone does not capture the timing or proceeds of a future sale.',
  'Follow the rental worked example or inspect the BRRRR example. Replace illustrative inputs with verified property facts before relying on a result.',
  'General reference: JPMorgan Chase’s cash-on-cash return explanation supports the distinction between operating cash yield and full-hold returns. It does not validate DealCooker’s model conventions. Reference checked November 14, 2026; educational context, not investment advice.'
];

test('methodology gives a decision-oriented metric reading path with model caveats and real examples', () => {
  const document = new JSDOM(read(file)).window.document;
  const section = document.querySelector('#compare-metrics');
  assert.ok(section, 'readers need the side-by-side metric decision guide');
  assert.equal(section.getAttribute('aria-labelledby'), 'compare-metrics-heading');
  assert.deepEqual([...section.querySelectorAll('h2,h3,p,li')].map(el => normalize(el.textContent)), blocks);
  assert.deepEqual([...section.querySelectorAll('a')].map(a => a.getAttribute('href')), [
    '/rental-property-calculator/#worked-example', '/brrrr-calculator/#worked-example',
    'https://jpmorgan.com/insights/real-estate/commercial-term-lending/cash-on-cash-return-cocr-in-real-estate'
  ]);
  for (const link of section.querySelectorAll('a[href^="/"]')) {
    const url = new URL(link.href, 'https://dealcooker.app');
    const target = new JSDOM(read(`${url.pathname.slice(1)}index.html`)).window.document;
    assert.ok(target.querySelector(url.hash), 'worked-example link must reach an existing public target');
  }
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) assert.equal(document.querySelector(selector)?.content, description);
  assert.equal(document.querySelector('time')?.dateTime, '2026-11-14');
  const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent));
  assert.equal(schemas.find(s => s['@type'] === 'WebPage')?.dateModified, '2026-11-14');
  assert.match(read('sitemap.xml'), /<loc>https:\/\/dealcooker.app\/methodology\/<\/loc><lastmod>2026-11-14<\/lastmod>/);
});

test('metric guide release preserves original definitions, examples, other pages, assets and indexing', { skip: !process.env.LANDING_METRIC_BASELINE }, () => {
  const baseline = path.resolve(process.env.LANDING_METRIC_BASELINE);
  const walk = (directory = '') => fs.readdirSync(path.join(baseline, directory), { withFileTypes: true }).flatMap(entry => {
    const relative = directory ? `${directory}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(relative) : [relative];
  });
  const files = walk();
  for (const relative of files) {
    const before = fs.readFileSync(path.join(baseline, relative));
    const after = fs.readFileSync(path.join('landing-dist', relative));
    if (relative === file) {
      const reverted = after.toString().replace(/<section id="compare-metrics"[\s\S]*?<\/section>\n/, '').replaceAll(description, oldDescription).replaceAll('2026-11-14', '2026-09-12');
      assert.equal(reverted, before.toString(), 'only the selected section, description and actual methodology date may change');
    } else if (relative === 'sitemap.xml') {
      assert.equal(after.toString().replace('<loc>https://dealcooker.app/methodology/</loc><lastmod>2026-11-14</lastmod>', '<loc>https://dealcooker.app/methodology/</loc><lastmod>2026-09-12</lastmod>'), before.toString());
    } else assert.deepEqual(after, before, `${relative} must stay byte-identical`);
  }
  const current = (directory = '') => fs.readdirSync(path.join('landing-dist', directory), { withFileTypes: true }).flatMap(entry => {
    const relative = directory ? `${directory}/${entry.name}` : entry.name;
    return entry.isDirectory() ? current(relative) : [relative];
  });
  assert.deepEqual(current().sort(), files.sort(), 'no new public/private paths or assets');
});
