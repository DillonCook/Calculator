import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const file = 'room-by-room-rental-calculator/index.html';
const read = relative => fs.readFileSync(path.join('landing-dist', relative), 'utf8');
const description = 'Estimate room-by-room rental cash flow with weekly rates, property-wide move-outs and separate cleaning and placement costs. Check PadSplit payout model limits.';
const oldDescription = 'Analyze room-by-room and PadSplit-style rentals for free with weekly room rates, occupancy, fees, turnover, furnishing, cash flow, DSCR, and IRR.';

test('room-rental visitors can distinguish property-wide turns and modeled fees from actual provider payouts', () => {
  const document = new JSDOM(read(file)).window.document;
  const guide = document.querySelector('#room-fee-guide');
  assert.ok(guide, 'the room page needs explicit property-wide turnover and fee-model guidance');
  assert.equal(guide.getAttribute('aria-labelledby'), 'room-fee-heading');
  assert.equal(guide.querySelector('h2').textContent, 'Room rental income: count the turns, then check the fees');
  for (const phrase of [
    'total move-outs across the whole property, not move-outs per room',
    'turnover cost per move-out multiplied by annual move-outs, divided by 12',
    'separate from the modeled tenant-placement fee',
    'weekly rate divided by seven, multiplied by ten',
    'platform percentage to all modeled gross revenue',
    'does not reproduce every provider exemption or payout rule',
    'first ten days do not also incur its service fee',
    'short stays, eligible referrals and within-portfolio transfers',
    'Annual revenue (optional) replaces room revenue plus other income',
    'move-outs still drive cleaning and placement costs',
    'not a monthly bank-deposit forecast',
    'Reference checked November 18, 2026'
  ]) assert.ok(guide.textContent.includes(phrase), `missing model guidance: ${phrase}`);
  assert.deepEqual([...guide.querySelectorAll('a')].map(a => a.getAttribute('href')), [
    'https://www.padsplit.com/help/article/earnings-payout-faqs-17566786',
    'https://www.padsplit.com/help/article/what-is-padsplit-s-fee-model-for-hosts-17566811',
    '#worked-example',
    'https://www.dealcooker.app/?utm_source=dealcooker_landing&utm_medium=organic&utm_campaign=seo_strategy_page&utm_content=room-by-room&strategy=padSplit'
  ]);
  assert.ok(document.querySelector('#worked-example'));
  assert.ok(document.querySelector('.hero-actions a[href="#worked-example"]'));
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) assert.equal(document.querySelector(selector)?.content, description);
  assert.equal(document.querySelector('time').dateTime, '2026-11-18');
  const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent));
  assert.equal(schemas.find(s => s['@type'] === 'WebPage').dateModified, '2026-11-18');
  assert.match(read('sitemap.xml'), /<loc>https:\/\/dealcooker.app\/room-by-room-rental-calculator\/<\/loc><lastmod>2026-11-18<\/lastmod>/);
});

test('room guide preserves all original examples, other public bytes and private indexing', { skip: !process.env.LANDING_ROOM_BASELINE }, () => {
  const baseline = path.resolve(process.env.LANDING_ROOM_BASELINE);
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
      const reverted = after.toString().replace(/<section id="room-fee-guide"[\s\S]*?<\/section>\n/, '').replaceAll(description, oldDescription).replaceAll('2026-11-18', '2026-07-24');
      assert.equal(reverted, before.toString(), 'only selected guide/description/room date may change');
    } else if (relative === 'sitemap.xml') {
      assert.equal(after.toString().replace('<loc>https://dealcooker.app/room-by-room-rental-calculator/</loc><lastmod>2026-11-18</lastmod>', '<loc>https://dealcooker.app/room-by-room-rental-calculator/</loc><lastmod>2026-07-24</lastmod>'), before.toString());
    } else assert.deepEqual(after, before, `${relative} must remain byte-identical`);
  }
});
