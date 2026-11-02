import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';

// Read-only audit of the existing public marketing sitemap, never deal routes.
const output = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !output.includes(`${path.sep}operations${path.sep}ceo${path.sep}evidence${path.sep}`)) throw new Error('Explicit project evidence directory required');
fs.mkdirSync(output, { recursive: true });
const origin = 'https://dealcooker.app';
const get = async (url) => {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  const body = await response.text();
  return { url, status: response.status, headers: Object.fromEntries(response.headers), body };
};
const sitemap = await get(`${origin}/sitemap.xml`);
const robots = await get(`${origin}/robots.txt`);
const urls = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const expectedPaths = ['/', '/methodology/', '/rental-property-calculator/', '/brrrr-calculator/', '/room-by-room-rental-calculator/', '/airbnb-investment-calculator/', '/fix-and-flip-calculator/', '/commercial-real-estate-calculator/', '/compare-rental-strategies/'];
if (urls.length !== expectedPaths.length || new Set(urls).size !== expectedPaths.length || urls.some(url => new URL(url).origin !== origin || new URL(url).search || !expectedPaths.includes(new URL(url).pathname))) throw new Error('Unexpected public sitemap; stop rather than broaden crawl');
const pages = [];
for (const url of urls) {
  const result = await get(url);
  const document = new JSDOM(result.body, { url }).window.document;
  const links = [...document.querySelectorAll('a[href]')].map(a => ({ text: a.textContent.trim(), href: a.href }));
  const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent));
  const name = new URL(url).pathname === '/' ? 'home' : new URL(url).pathname.split('/')[1];
  fs.writeFileSync(path.join(output, `${name}.html`), result.body);
  pages.push({ url, status: result.status, headers: result.headers, sha256: createHash('sha256').update(result.body).digest('hex'), title: document.title, description: document.querySelector('meta[name="description"]')?.content, h1: [...document.querySelectorAll('h1')].map(n => n.textContent), headings: [...document.querySelectorAll('h2')].map(n => n.textContent), canonical: document.querySelector('link[rel="canonical"]')?.href, robots: document.querySelector('meta[name="robots"]')?.content, links, brokenFragments: links.filter(l => l.href.startsWith(`${url}#`) && !document.getElementById(new URL(l.href).hash.slice(1))), schemaTypes: schemas.map(s => s['@type']), schemas, assets: [...document.querySelectorAll('img[src],script[src],link[rel="stylesheet"]')].map(n => n.src || n.href) });
}
const probes = [];
for (const url of [`http://dealcooker.app/`, `${origin}/index.html`, `${origin}/rental-property-calculator`, `${origin}/rental-property-calculator/index.html`, `${origin}/not-a-real-page-seo-check/`, 'https://www.dealcooker.app/']) {
  const result = await get(url);
  probes.push({ url, status: result.status, headers: result.headers });
}
const receipt = { sitemap: { ...sitemap, body: sitemap.body }, robots, pageCount: pages.length, pages, probes, searchConsole: 'unavailable: no verified existing adapter', indexedPages: null, impressions: null, organicClicks: null, organicLandingSessions: null, genuineCompletedAnalysisUsers: null };
fs.writeFileSync(path.join(output, 'public-seo.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ pageCount: pages.length, pages: pages.map(({url,status,title,h1,canonical,robots,brokenFragments,schemaTypes}) => ({url,status,title,h1,canonical,robots,brokenFragments,schemaTypes})), probes: probes.map(({url,status,headers}) => ({url,status,location:headers.location,robots:headers['x-robots-tag']})) }, null, 2));
