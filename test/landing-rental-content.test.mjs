import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';

// Exact owner-approved rental-page v1, published November 2, 2026.
const title = 'Free Rental Property Cash Flow Calculator | DealCooker';
const description = "Estimate rental cash flow with financing, vacancy, expenses and reserves. Use a practical input checklist, then compare returns in DealCooker's free calculator.";
const date = '2026-11-02';
const file = 'rental-property-calculator/index.html';
const read = relative => fs.readFileSync(path.join('landing-dist', relative), 'utf8');
const normalize = value => value.replace(/\s+/g, ' ').trim();
const blocks = [
  'Rental cash flow: what to check before you calculate',
  'Rent minus the mortgage is only a starting point. A rental analysis also needs vacancy, taxes, insurance, operating costs and reserves. Gather property-specific evidence before treating a positive result as spendable income.',
  'Rent and vacancy. Check leases, comparable rents and local vacancy conditions. Use your own supported assumptions, not a promise that the property will stay full.',
  'Taxes and insurance. Check the tax estimate for the proposed purchase and obtain a property-specific insurance quote. In DealCooker, enter these separately from the loan terms. Do not count them again just because a lender includes them in an escrow payment.',
  'Running costs and reserves. Include owner-paid utilities, HOA fees, management, maintenance and capital reserves where applicable. A reserve is a planning allowance; actual repairs and replacements can arrive unevenly.',
  'Cash needed to start. Review the down payment, acquisition costs and rehab budget. Monthly cash flow does not show how much cash you need before the property starts operating.',
  'Read the result in the right order',
  'First, inspect modeled monthly cash flow after expenses, reserves and debt service. Next, compare cash-on-cash return with the cash invested; it is not the same as cap rate. Finally, review the full hold-period projection and test a lower-rent or higher-cost scenario before relying on the original result.',
  "DealCooker's modeled NOI can include reserves and strategy-dependent fixed costs, so it may differ from a lender's NOI. Read the methodology for the calculator's definitions. The long-term rental placement-fee input is informational and excluded from returns; budget actual leasing costs separately.",
  "These are pre-tax estimates, not investment advice or a forecast. Verify property facts and lender terms independently. For general context, see the CFPB's PITI explanation and IRS residential rental-property guidance. Tax-accounting rules are not the calculator's cash-flow model.",
  'Run the rental analysis — free'
];

test('rental page publishes only the exact approved input and result guidance', () => {
  const document = new JSDOM(read(file)).window.document;
  assert.equal(document.title, title);
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) assert.equal(document.querySelector(selector)?.content, description);
  for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) assert.equal(document.querySelector(selector)?.content, title);
  const section = document.querySelector('section.rental-checklist');
  assert.ok(section, 'approved rental checklist must be present');
  assert.deepEqual([...section.querySelectorAll('h2,h3,p,li')].map(element => normalize(element.textContent)), blocks);
  assert.equal(section.previousElementSibling?.classList.contains('direct-answer'), true);
  assert.equal(section.nextElementSibling?.id, 'worked-example');
  assert.deepEqual([...section.querySelectorAll('a')].map(a => [a.textContent, a.href]), [
    ['methodology', 'https://dealcooker.app/methodology/'],
    ['PITI explanation', 'https://www.consumerfinance.gov/ask-cfpb/what-is-piti-en-152/'],
    ['residential rental-property guidance', 'https://www.irs.gov/publications/p527'],
    ['Run the rental analysis — free', 'https://www.dealcooker.app/?utm_source=dealcooker_landing&utm_medium=organic&utm_campaign=seo_strategy_page&utm_content=rental&strategy=longTerm']
  ]);
  assert.equal(document.querySelector('time')?.dateTime, date);
  const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent));
  assert.equal(schemas.find(s => s['@type'] === 'WebPage')?.dateModified, date);
  assert.match(read('sitemap.xml'), /<loc>https:\/\/dealcooker.app\/rental-property-calculator\/<\/loc><lastmod>2026-11-02<\/lastmod>/);
});

test('release equivalence preserves every byte outside approved metadata, section and rental dates', { skip: !process.env.LANDING_PUBLICATION_BASELINE }, () => {
  const baseline = path.resolve(process.env.LANDING_PUBLICATION_BASELINE);
  const compare = relative => {
    const before = fs.readFileSync(path.join(baseline, relative));
    const after = fs.readFileSync(path.join('landing-dist', relative));
    if (relative === file) {
      const oldTitle = 'Free Rental Property Calculator | DealCooker';
      const oldDescription = 'Analyze a long-term rental for free. Model cash flow, cap rate, cash-on-cash return, DSCR, ROI, IRR, reserves, financing, and a future sale.';
      const reverted = after.toString().replace(/<section class="rental-checklist[\s\S]*?<\/section>\n/, '').replaceAll(title, oldTitle).replaceAll(description, oldDescription).replaceAll(date, '2026-09-12');
      assert.equal(reverted, before.toString(), 'existing worked example, H1, links, schema and all other rental content must be unchanged');
    } else if (relative === 'sitemap.xml') {
      assert.equal(after.toString().replace('<loc>https://dealcooker.app/rental-property-calculator/</loc><lastmod>2026-11-02</lastmod>', '<loc>https://dealcooker.app/rental-property-calculator/</loc><lastmod>2026-09-12</lastmod>'), before.toString());
    } else assert.deepEqual(after, before, `${relative} must be byte-identical`);
  };
  const walk = (directory = '') => {
    for (const entry of fs.readdirSync(path.join(baseline, directory), { withFileTypes: true })) {
      const relative = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(relative); else compare(relative);
    }
  };
  walk();
});
