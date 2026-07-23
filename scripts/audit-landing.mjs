import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const outDir = path.join(root, 'landing-dist');
const expectedRoutes = [
  '/',
  '/rental-property-calculator/',
  '/brrrr-calculator/',
  '/room-by-room-rental-calculator/',
  '/airbnb-investment-calculator/',
  '/fix-and-flip-calculator/',
  '/commercial-real-estate-calculator/',
  '/compare-rental-strategies/'
];
const strategyRoutes = new Map([
  ['/rental-property-calculator/', 'longTerm'],
  ['/brrrr-calculator/', 'brrrr'],
  ['/room-by-room-rental-calculator/', 'padSplit'],
  ['/airbnb-investment-calculator/', 'airbnb'],
  ['/fix-and-flip-calculator/', 'flip'],
  ['/commercial-real-estate-calculator/', 'purchase']
]);

const routeFile = (route) => route === '/' ? path.join(outDir, 'index.html') : path.join(outDir, route.slice(1), 'index.html');
const read = (file) => fs.readFileSync(file, 'utf8');
const stripTags = (value) => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const matchAll = (html, regex) => [...html.matchAll(regex)].map((match) => match[1]);

assert.ok(fs.existsSync(outDir), 'landing-dist must exist after the landing build');

const invalidRenderedNumber = /(?:\$NaN|\bNaN\b|Infinity|undefined)/;
const titles = new Set();
const descriptions = new Set();
for (const route of expectedRoutes) {
  const file = routeFile(route);
  assert.ok(fs.existsSync(file), `missing generated page: ${route}`);
  const html = read(file);
  const [title] = matchAll(html, /<title>([\s\S]*?)<\/title>/gi);
  const [description] = matchAll(html, /<meta\s+name="description"\s+content="([^"]+)"/gi);
  const headings = matchAll(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi);
  const [canonical] = matchAll(html, /<link\s+rel="canonical"\s+href="([^"]+)"/gi);
  const jsonLdBlocks = matchAll(html, /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi);

  assert.ok(title && stripTags(title).length >= 24 && stripTags(title).length <= 70, `${route} title must be useful and concise`);
  assert.ok(description && description.length >= 90 && description.length <= 165, `${route} description must be useful and concise`);
  assert.equal(headings.length, 1, `${route} must contain exactly one H1`);
  assert.ok(stripTags(headings[0]).length >= 18, `${route} H1 must be substantive`);
  assert.equal(canonical, `https://dealcooker.app${route}`, `${route} must self-canonicalize on the owned apex`);
  assert.match(html, /<meta\s+name="robots"\s+content="index,follow,max-image-preview:large"/i, `${route} must explicitly permit indexing`);
  assert.match(html, /href="#main-content"/, `${route} must include a skip link`);
  assert.match(html, /<main id="main-content" tabindex="-1">/, `${route} must expose a focusable skip-link target`);
  assert.match(html, /https:\/\/www\.dealcooker\.app\//, `${route} must link to the app at www`);
  assert.doesNotMatch(stripTags(html), invalidRenderedNumber, `${route} must not render invalid numeric output`);
  assert.match(html, /utm_source=dealcooker_landing/, `${route} app CTA must preserve source attribution`);
  if (strategyRoutes.has(route)) assert.match(html, new RegExp(`&amp;strategy=${strategyRoutes.get(route)}`), `${route} CTA must deep-link to its app strategy`);
  assert.doesNotMatch(html, /dealcooker\.com/i, `${route} must not reference the unowned .com domain`);
  assert.ok(jsonLdBlocks.length >= 1, `${route} must include structured data`);
  for (const block of jsonLdBlocks) JSON.parse(block.replaceAll('&amp;', '&'));
  assert.ok(!titles.has(title), `${route} title must be unique`);
  assert.ok(!descriptions.has(description), `${route} description must be unique`);
  titles.add(title);
  descriptions.add(description);
}

const homepage = read(routeFile('/'));
assert.match(homepage, /\bfree\b/gi, 'homepage must clearly advertise DealCooker as free');
assert.match(homepage, /Make the deal work/i, 'homepage must feature DealCooker’s signature recommendation capability');
assert.match(homepage, /No signup required/i, 'homepage must state the anonymous-start benefit');
assert.match(homepage, /Commercial[\s\S]*Long-Term[\s\S]*Airbnb[\s\S]*PadSplit[\s\S]*BRRRR[\s\S]*Flip/i, 'homepage must name all supported strategies');
assert.match(homepage, /<table class="comparison-table">[\s\S]*<th scope="col">[\s\S]*<th scope="row">/, 'homepage comparison must use semantic table markup');

const robots = read(path.join(outDir, 'robots.txt'));
assert.match(robots, /User-agent: \*/);
assert.match(robots, /Allow: \//);
assert.match(robots, /Sitemap: https:\/\/dealcooker\.app\/sitemap\.xml/);

const sitemap = read(path.join(outDir, 'sitemap.xml'));
for (const route of expectedRoutes) {
  assert.match(sitemap, new RegExp(`<loc>https://dealcooker\\.app${route.replaceAll('/', '\\/')}</loc>`), `sitemap must list ${route}`);
}

const css = read(path.join(outDir, 'assets', 'site.css'));
assert.match(css, /:focus-visible/, 'site CSS must include visible keyboard focus treatment');
assert.match(css, /prefers-reduced-motion/, 'site CSS must respect reduced motion preferences');
assert.match(css, /@media\s*\(max-width:/, 'site CSS must include responsive behavior');
assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x:\s*hidden/, 'body overflow must not conceal responsive clipping');

const siteJs = read(path.join(outDir, 'assets', 'site.js'));
assert.match(siteJs, /event\.key === 'Escape'/, 'mobile navigation must close with Escape');
assert.match(siteJs, /button\.focus\(\)/, 'mobile navigation must restore focus when dismissed');

const headers = read(path.join(outDir, '_headers'));
assert.doesNotMatch(
  headers,
  /\/assets\/\*[\s\S]*?immutable/,
  'stable asset filenames must not receive immutable caching'
);

const allFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else allFiles.push(absolute);
  }
};
walk(outDir);
for (const file of allFiles.filter((entry) => entry.endsWith('.html'))) {
  const html = read(file);
  for (const href of matchAll(html, /href="([^"]+)"/gi)) {
    if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/assets/') || href === '/') continue;
    const clean = href.split('#')[0].split('?')[0];
    if (!clean.endsWith('/')) continue;
    assert.ok(fs.existsSync(routeFile(clean)), `broken internal route ${clean} in ${path.relative(outDir, file)}`);
  }
}

console.log(`Landing audit passed for ${expectedRoutes.length} indexable pages.`);
