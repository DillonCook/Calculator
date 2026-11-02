import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const baseline = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !baseline.includes(`${path.sep}operations${path.sep}ceo${path.sep}evidence${path.sep}`)) throw new Error('Explicit baseline evidence directory required');
const before = JSON.parse(fs.readFileSync(path.join(baseline, 'public-seo.json'), 'utf8'));
assert.equal(before.pages.length, 9);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const results = [];
for (const page of before.pages) {
  const route = new URL(page.url).pathname;
  const name = route === '/' ? 'home' : route.split('/')[1];
  const oldHtml = fs.readFileSync(path.join(baseline, `${name}.html`), 'utf8');
  const built = fs.readFileSync(path.join('landing-dist', route === '/' ? 'index.html' : `${route.slice(1)}index.html`), 'utf8');
  // Only the eight already-present decorative inline heights may move to CSS.
  const expected = route === '/' ? oldHtml.replace(/<i style="height:(?:52|60|67|72|78|84|88|94)%"><\/i>/g, '<i></i>') : oldHtml;
  assert.equal(built, expected, `${route} must preserve all public bytes except CSP-safe decorative markup`);
  results.push({ url: page.url, baselineSha256: hash(oldHtml), builtSha256: hash(built), expectedOnlyChange: route === '/' ? 'inline decorative heights moved to external CSS' : 'byte-identical' });
}
const oldMark = fs.readFileSync('public/brand/dealcooker-logo.png');
const newMark = fs.readFileSync('landing-dist/assets/dealcooker-mark.png');
assert.ok(newMark.length < oldMark.length);
const result = { checkedPages: results.length, results, mark: { beforeBytes: oldMark.length, afterBytes: newMark.length, bytesSaved: oldMark.length-newMark.length, percentReduction: Number((100*(oldMark.length-newMark.length)/oldMark.length).toFixed(2)), beforeDimensions: [oldMark.readUInt32BE(16),oldMark.readUInt32BE(20)], afterDimensions: [newMark.readUInt32BE(16),newMark.readUInt32BE(20)], sha256:hash(newMark) } };
fs.writeFileSync(path.join(baseline, '..', 'artifact-equivalence.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
