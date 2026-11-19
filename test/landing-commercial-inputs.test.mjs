import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const file = 'commercial-real-estate-calculator/index.html';
const read = relative => fs.readFileSync(path.join('landing-dist', relative), 'utf8');
const description = 'Turn a commercial rent roll into calculator inputs: annual rent per square foot, occupied area, vacancy, recoveries, reserves and modeled debt coverage.';
const oldDescription = 'Underwrite a small commercial property for free with leased square footage, rent per square foot, vacancy, credit loss, reserves, NOI, DSCR, ROI, and IRR.';

test('commercial visitors can translate rent-roll units and reconcile vacancy, recoveries and reserves', () => {
  const document = new JSDOM(read(file)).window.document;
  const guide = document.querySelector('#commercial-input-guide');
  assert.ok(guide, 'Commercial entry needs a rent-roll-to-input walkthrough');
  assert.equal(guide.getAttribute('aria-labelledby'), 'commercial-input-heading');
  assert.equal(guide.querySelector('h2').textContent, 'From rent roll to commercial calculator inputs');
  for (const phrase of [
    'annual dollars per occupied square foot, not monthly dollars or the whole property’s annual rent',
    'Occupied square feet already remove physical vacancy',
    'each deducted separately from occupied rent plus recoveries',
    'not a second entry of the same unleased space',
    'Reimbursements are income, not an instruction to delete property expenses',
    'total leasable area, not just occupied area',
    'already include those tenant and leasing reserves before debt service',
    'does not schedule individual lease expirations, free-rent periods or renewal costs',
    'DSCR above 1 is not loan approval',
    'References checked November 19, 2026'
  ]) assert.ok(guide.textContent.includes(phrase), `missing commercial guidance: ${phrase}`);
  assert.deepEqual([...guide.querySelectorAll('a')].map(a => a.getAttribute('href')), [
    'https://www.occ.gov/publications-and-resources/publications/comptrollers-handbook/files/commercial-real-estate-lending/pub-ch-commercial-real-estate.pdf',
    '#worked-example',
    'https://www.dealcooker.app/?utm_source=dealcooker_landing&utm_medium=organic&utm_campaign=seo_strategy_page&utm_content=commercial&strategy=purchase'
  ]);
  assert.ok(document.querySelector('.hero-actions a[href="#worked-example"]'));
  assert.ok(document.querySelector('#worked-example'));
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) assert.equal(document.querySelector(selector)?.content, description);
  assert.equal(document.querySelector('time').dateTime, '2026-11-19');
  const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent));
  assert.equal(schemas.find(s => s['@type'] === 'WebPage').dateModified, '2026-11-19');
  assert.match(read('sitemap.xml'), /<loc>https:\/\/dealcooker.app\/commercial-real-estate-calculator\/<\/loc><lastmod>2026-11-19<\/lastmod>/);
});

test('commercial guide preserves all original examples, other public bytes and private inventory', { skip: !process.env.LANDING_COMMERCIAL_BASELINE }, () => {
  const baseline = path.resolve(process.env.LANDING_COMMERCIAL_BASELINE);
  const walk = (root, directory = '') => fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const relative = directory ? `${directory}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(root, relative) : [relative];
  });
  const files = walk(baseline).sort();
  assert.deepEqual(walk('landing-dist').sort(), files, 'no public/private paths or assets added');
  for (const relative of files) {
    const before = fs.readFileSync(path.join(baseline, relative));
    const after = fs.readFileSync(path.join('landing-dist', relative));
    if (relative === file) {
      const reverted = after.toString().replace(/<section id="commercial-input-guide"[\s\S]*?<\/section>\n/, '').replaceAll(description, oldDescription).replaceAll('2026-11-19', '2026-07-24');
      assert.equal(reverted, before.toString(), 'only selected guide/description/commercial dates may change');
    } else if (relative === 'sitemap.xml') {
      assert.equal(after.toString().replace('<loc>https://dealcooker.app/commercial-real-estate-calculator/</loc><lastmod>2026-11-19</lastmod>', '<loc>https://dealcooker.app/commercial-real-estate-calculator/</loc><lastmod>2026-07-24</lastmod>'), before.toString());
    } else assert.deepEqual(after, before, `${relative} must remain byte-identical`);
  }
});
