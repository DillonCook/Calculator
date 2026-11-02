import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const output = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !output.includes(`${path.sep}operations${path.sep}ceo${path.sep}evidence${path.sep}`)) throw new Error('Explicit project evidence directory required');
fs.mkdirSync(output, { recursive: true });
const routes = ['/', '/methodology/', '/rental-property-calculator/', '/brrrr-calculator/', '/room-by-room-rental-calculator/', '/airbnb-investment-calculator/', '/fix-and-flip-calculator/', '/commercial-real-estate-calculator/', '/compare-rental-strategies/'];
const files = [...routes.map(route => route === '/' ? 'index.html' : `${route.slice(1)}index.html`), 'assets/site.css', 'assets/site.js', 'assets/analytics.js', 'assets/dealcooker-mark.png', 'assets/favicon.png', 'assets/apple-touch-icon.png', 'assets/dealcooker-product.jpg', 'assets/dealcooker-social.jpg', 'robots.txt', 'sitemap.xml', 'llms.txt', 'f2a2e51a3452babd2382b0dc1332c80d.txt'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const receipt = { generatedAt: new Date().toISOString(), origin: 'https://dealcooker.app', files: [], appNoindex: false, passed: false };
try {
  for (const file of files) {
    const url = `https://dealcooker.app/${file.endsWith('index.html') ? file.slice(0, -10) : file}`;
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, `${url} must return 200`);
    const actual = Buffer.from(await response.arrayBuffer());
    const expected = fs.readFileSync(path.join('landing-dist', file));
    const destination = path.join(output, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, actual);
    const text = /\.(html|css|js|xml|txt)$/.test(file);
    const exact = actual.equals(expected);
    const newlineOnly = !exact && text && actual.toString().replaceAll('\r\n', '\n') === expected.toString().replaceAll('\r\n', '\n');
    receipt.files.push({ file, url, bytes: actual.length, sha256: hash(actual), expectedSha256: hash(expected), exact, newlineOnly });
    assert.ok(exact || newlineOnly, `${url} must match the tested artifact (only CRLF/LF differences permitted)`);
  }
  const app = await fetch('https://www.dealcooker.app/', { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(30000) });
  receipt.appStatus = app.status;
  receipt.appRobots = app.headers.get('x-robots-tag');
  receipt.appNoindex = app.status === 200 && /noindex/.test(receipt.appRobots || '');
  assert.equal(receipt.appNoindex, true, 'Intentional app noindex boundary must remain');
  receipt.passed = true;
} finally {
  fs.writeFileSync(path.join(output, 'artifact-readback.json'), JSON.stringify(receipt, null, 2));
}
console.log(JSON.stringify(receipt, null, 2));
