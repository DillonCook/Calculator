// Live guest marketing-to-app regression; isolated, analytics-silent, read-only network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const output = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !output.includes(`${path.sep}operations${path.sep}ceo${path.sep}evidence${path.sep}`)) throw Error('Explicit project evidence directory required');
if (process.argv.length !== 3) throw Error('Only canonical live marketing/app targets supported');
const scratch = process.env.TMPDIR;
if (!scratch) throw Error('Explicit profile-owned TMPDIR required');
fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(scratch, 'dealcooker-marketing-journey-'));
const port = 9347;
const child = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--disable-background-networking', '--no-first-run',
  '--no-default-browser-check', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const cases = [
  { slug: 'rental-property-calculator', strategy: 'longTerm', label: 'Long-Term', field: 'Expected monthly rent' },
  { slug: 'airbnb-investment-calculator', strategy: 'airbnb', label: 'Airbnb', field: 'Expected monthly booking revenue' },
  { slug: 'fix-and-flip-calculator', strategy: 'flip', label: 'Flip', field: 'Expected resale value' },
  { slug: 'brrrr-calculator', strategy: 'brrrr', label: 'BRRRR' },
  { slug: 'room-by-room-rental-calculator', strategy: 'padSplit', label: 'PadSplit' },
  { slug: 'commercial-real-estate-calculator', strategy: 'purchase', label: 'Commercial' }
];
const origins = new Set(['https://dealcooker.app', 'https://www.dealcooker.app']);
const analyticsPattern = /google-analytics|googletagmanager|\/api\/analytics/;
const rows = [], requests = [], documents = [], blocked = [], exceptions = [];
let ws, send, browserCloseAccepted = false, failure;
try {
  let target;
  for (let n = 0; n < 50 && !target; n++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {}
    if (!target) await pause(100);
  }
  if (!target) throw Error('Isolated Chrome unavailable');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let id = 0;
  const pending = new Map();
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(key, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: key, method, params }));
  });
  ws.on('message', raw => {
    const event = JSON.parse(String(raw));
    if (pending.has(event.id)) {
      const p = pending.get(event.id); pending.delete(event.id); clearTimeout(p.timer);
      if (event.error) p.reject(Error(event.error.message)); else p.resolve(event.result);
    }
    if (event.method === 'Network.requestWillBeSent') {
      requests.push({ url: event.params.request.url, method: event.params.request.method, type: event.params.type });
      if (event.params.type === 'Document') documents.push({ url: event.params.request.url, redirectStatus: event.params.redirectResponse?.status, redirectFrom: event.params.redirectResponse?.url });
    }
    if (event.method === 'Runtime.exceptionThrown') exceptions.push(event.params.exceptionDetails.text);
    if (event.method === 'Fetch.requestPaused') {
      const { requestId, request } = event.params;
      const u = new URL(request.url);
      const allowed = request.method === 'GET' && origins.has(u.origin) && !analyticsPattern.test(u.href)
        && !/^\/(api|auth|account|s|r|share|print)(\/|$)/.test(u.pathname);
      if (!allowed) blocked.push({ url: request.url, method: request.method, resourceType: event.params.resourceType, prefetch: request.headers['Next-Router-Prefetch'] || request.headers['next-router-prefetch'], purpose: request.headers.Purpose || request.headers.purpose });
      send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId, ...(allowed ? {} : { errorReason: 'BlockedByClient' }) }).catch(() => {});
    }
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let n = 0; n < 100; n++) {
      try { if (await evaluate(expression)) return; } catch {}
      await pause(100);
    }
    throw Error(`Timed out waiting: ${expression}`);
  };
  const screenshot = async name => {
    const file = path.join(output, `${name}.png`);
    fs.writeFileSync(file, Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'));
    return file;
  };
  const nativePointer = async (point, mobile) => {
    assert.equal(point?.hit, true, 'Visible native target must be hit-testable');
    const { x, y } = point;
    if (mobile) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
  };
  const button = async (label, mobile) => {
    const point = await evaluate(`(() => {const e=[...document.querySelectorAll('button')].find(x=>x.getClientRects().length && (x.getAttribute('aria-label')||x.textContent.trim())===${JSON.stringify(label)});if(!e)return null;e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:document.elementFromPoint(x,y)?.closest('button')===e};})()`);
    await nativePointer(point, mobile); await pause(250);
  };
  const fill = async (label, value) => {
    const found = await evaluate(`(() => {const e=[...document.querySelectorAll('label')].find(x=>x.getClientRects().length && x.firstChild?.textContent===${JSON.stringify(label)})?.querySelector('input');if(!e)return false;e.scrollIntoView({block:'center',behavior:'instant'});e.focus();e.select();return true;})()`);
    assert.equal(found, true, `Input must exist: ${label}`);
    await send('Input.insertText', { text: value }); await pause(100);
    return evaluate(`([...document.querySelectorAll('label')].find(x=>x.getClientRects().length && x.firstChild?.textContent===${JSON.stringify(label)})?.querySelector('input')?.value)`);
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `if(['https://dealcooker.app','https://www.dealcooker.app'].includes(location.origin)){window.__qaInitialHref=location.href;const u=new URL(location.href);u.searchParams.set('dc_qa','1');u.searchParams.set('dc_analytics','off');history.replaceState(null,'',u.href);localStorage.clear();}` });
  for (const width of [1440, 390]) {
    const mobile = width === 390;
    await send('Emulation.setDeviceMetricsOverride', { width, height: mobile ? 844 : 1000, deviceScaleFactor: 1, mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    for (const item of cases) {
      const startDocument = documents.length;
      const row = { ...item, width, activation: mobile ? 'native_touch' : 'native_mouse' };
      rows.push(row);
      await send('Page.navigate', { url: `https://dealcooker.app/${item.slug}/?dc_qa=1&dc_analytics=off` });
      await waitFor("document.readyState==='complete' && !!document.querySelector('.strategy-hero a.button-primary')");
      await evaluate("document.querySelector('.strategy-hero a.button-primary').scrollIntoView({block:'center',behavior:'instant'})");
      row.target = await evaluate(`(() => {const a=document.querySelector('.strategy-hero a.button-primary'),r=a.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:document.elementFromPoint(x,y)?.closest('a')===a,href:a.href,text:a.innerText,target:a.target};})()`);
      const href = new URL(row.target.href);
      assert.equal(href.origin, 'https://www.dealcooker.app');
      assert.equal(href.pathname, '/');
      assert.equal(href.searchParams.get('strategy'), item.strategy);
      assert.equal(href.searchParams.get('utm_source'), 'dealcooker_landing');
      assert.equal(row.target.target, '', 'CTA should navigate this tab, not an unobserved popup');
      row.before = await screenshot(`${item.strategy}-${width}-cta`);
      await nativePointer(row.target, mobile);
      await waitFor("location.origin==='https://www.dealcooker.app' && !!document.querySelector('main[data-experience]') && !!document.querySelector('button') && !new URL(location.href).searchParams.has('utm_source')");
      await pause(1000);
      row.destination = await evaluate(`(() => {const visible=e=>!!e?.getClientRects().length;const wizard=document.querySelector('.deal-quick-start');const price=[...document.querySelectorAll('label')].filter(visible).find(x=>x.firstChild?.textContent==='Purchase price')?.querySelector('input');return {href:location.href,initialHref:window.__qaInitialHref,referrer:document.referrer,heading:wizard?.querySelector('h2')?.textContent,wizard:visible(wizard),priceVisible:visible(price),price:price?.value,fieldLabels:[...document.querySelectorAll('.deal-quick-start label')].map(x=>x.firstChild?.textContent),selected:innerWidth===390?document.querySelector('button[aria-label="Choose strategy"]')?.innerText:document.querySelector('[aria-label="Desktop strategy selector"] .btn-selector-active')?.textContent,experience:document.querySelector('main')?.dataset.experience,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,gaLoaded:!!window.__dealcookerGaLoaded,trackingKeys:[...Object.keys(localStorage),...Object.keys(sessionStorage)].filter(x=>/analytics|milestones/.test(x))};})()`);
      row.documents = documents.slice(startDocument);
      assert.equal(row.destination.initialHref, row.target.href, 'Browser must follow exact real CTA without synthetic URL reconstruction');
      assert.equal(new URL(row.destination.referrer).origin, 'https://dealcooker.app');
      assert.equal(row.destination.experience, 'guided');
      assert.equal(row.destination.priceVisible, true);
      assert.equal(row.destination.gaLoaded, false);
      assert.deepEqual(row.destination.trackingKeys, []);
      assert.ok(row.destination.scrollWidth <= width);
      const destinationUrl = new URL(row.destination.href);
      assert.equal(destinationUrl.searchParams.get('dc_qa'), '1');
      assert.equal(destinationUrl.searchParams.get('dc_analytics'), 'off');
      assert.equal(destinationUrl.searchParams.has('utm_source'), false, 'Existing marketing cleanup should consume tags');
      if (item.field) {
        assert.equal(row.destination.wizard, true);
        assert.equal(row.destination.heading, 'Start with the property.');
        assert.ok(row.destination.fieldLabels.includes(item.field));
        assert.equal(row.destination.price, '');
      } else {
        assert.equal(row.destination.wizard, false);
        assert.ok(row.destination.selected?.includes(item.label), 'Visible selected strategy must match CTA');
      }
      row.after = await screenshot(`${item.strategy}-${width}-destination`);
      row.editedPrice = await fill('Purchase price', '321234.56');
      assert.equal(row.editedPrice, '321234.56', 'Native text insertion must reach a usable price field');
      if (item.strategy === 'longTerm') {
        await fill('Expected monthly rent', '3000');
        await fill('Down payment %', '20'); await fill('Interest rate %', '6.875');
        await button('Next: costs', mobile);
        await fill('Annual property tax', '2134.56'); await fill('Annual insurance', '1789.50');
        await fill('Other operating costs / month', '150.25'); await fill('Upfront rehab budget', '12780.90');
        await button('See my provisional result', mobile);
        await waitFor("!!document.querySelector('.decision-brief h2')");
        row.completion = await evaluate(`({heading:document.querySelector('.decision-brief h2')?.textContent,focused:document.activeElement===document.querySelector('.decision-brief h2'),summary:document.querySelector('.decision-brief')?.innerText,gaLoaded:!!window.__dealcookerGaLoaded,trackingKeys:[...Object.keys(localStorage),...Object.keys(sessionStorage)].filter(x=>/analytics|milestones/.test(x))})`);
        assert.equal(row.completion.focused, true);
        assert.ok(row.completion.summary?.toLowerCase().includes('provisional • assumptions need review'));
        assert.equal(row.completion.gaLoaded, false); assert.deepEqual(row.completion.trackingKeys, []);
        row.resultScreenshot = await screenshot(`longTerm-${width}-result`);
      }
      row.afterInteractionQa = await evaluate(`({gaLoaded:!!window.__dealcookerGaLoaded,trackingKeys:[...Object.keys(localStorage),...Object.keys(sessionStorage)].filter(x=>/analytics|milestones/.test(x))})`);
      assert.equal(row.afterInteractionQa.gaLoaded, false);
      assert.deepEqual(row.afterInteractionQa.trackingKeys, []);
      row.passed = true;
    }
  }
  assert.equal(rows.length, cases.length * 2);
  assert.ok(rows.every(row => row.passed));
  assert.equal(requests.filter(r => analyticsPattern.test(r.url)).length, 0, 'No attempted analytics, even blocked');
  assert.equal(requests.filter(r => r.method !== 'GET').length, 0, 'No attempted remote write');
  assert.equal(blocked.length, 0, 'No unexpected external/private requests; inspect retained blocked rows');
  assert.deepEqual(exceptions, []);
} catch (error) {
  failure = { name: error.name, message: error.message };
  try { fs.writeFileSync(path.join(output, 'failure.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); } catch {}
  process.exitCode = 1;
} finally {
  if (send) { try { await send('Browser.close'); browserCloseAccepted = true; } catch {} }
  if (ws) ws.close();
  if (browserCloseAccepted) {
    if (child.exitCode === null) await Promise.race([new Promise(resolve => child.once('exit', resolve)), pause(3000)]);
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
  }
  const result = { observedAt: new Date().toISOString(), appBytes: 'canonical production, no request rewrite', rows, documents, requests, blocked, exceptions, failure, passed: !failure && rows.length === cases.length * 2, limits: 'Synthetic native mouse/emulated touch, exact production CTA and guest app. Only rental completed; other strategies verify entry and editable price. Not real handset, screen-reader compliance, attribution, human conversion or genuine-user evidence.' };
  fs.writeFileSync(path.join(output, 'journey.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(output, 'cleanup.json'), JSON.stringify({ browserCloseAccepted, childExitCode: child.exitCode, profile, profileRemoved: !fs.existsSync(profile), port }, null, 2));
  console.log(JSON.stringify({ passed: result.passed, rows: rows.length, completed: rows.filter(row => row.passed).length, failure, analyticsRequests: requests.filter(r=>analyticsPattern.test(r.url)).length, blocked: blocked.length, browserCloseAccepted, childExitCode: child.exitCode }, null, 2));
}
