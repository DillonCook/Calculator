import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import assert from 'node:assert/strict';

const output = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !output.includes(`${path.sep}operations${path.sep}ceo${path.sep}evidence${path.sep}`)) throw new Error('Explicit project evidence directory required');
fs.mkdirSync(output, { recursive: true });
if (process.argv[3] && !['--local', '--verify'].includes(process.argv[3])) throw new Error('Only canonical production or --local QA is supported');
const local = process.argv[3] === '--local';
const origin = local ? 'http://127.0.0.1:4319' : 'https://dealcooker.app';
let server;
if (local) {
  const root = path.resolve('landing-dist');
  const csp = fs.readFileSync(path.join(root, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, origin).pathname;
    const file = path.resolve(root, `.${pathname}${pathname.endsWith('/') ? 'index.html' : ''}`);
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'text/plain', 'Content-Security-Policy': csp });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4319, '127.0.0.1', resolve); });
}
const profile = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'dealcooker-landing-qa-'));
const port = 9345;
const child = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
let send;
const rows = [];
const requests = [];
const exceptions = [];
const violations = [];
let cleanup = false;
try {
  let target;
  for (let n = 0; n < 50; n++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch {}
    if (target) break;
    await delay(100);
  }
  if (!target) throw new Error('Isolated Chrome unavailable');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let next = 0;
  const pending = new Map();
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
  ws.on('message', data => {
    const event = JSON.parse(String(data));
    if (pending.has(event.id)) {
      const p = pending.get(event.id); pending.delete(event.id); clearTimeout(p.timer);
      if (event.error) p.reject(new Error(event.error.message)); else p.resolve(event.result);
    }
    if (event.method === 'Network.requestWillBeSent') requests.push(event.params.request.url);
    if (event.method === 'Runtime.exceptionThrown') exceptions.push(event.params.exceptionDetails.text);
    if (event.method === 'Log.entryAdded' && event.params.entry.level === 'error') violations.push(event.params.entry.text);
    if (event.method === 'Fetch.requestPaused') {
      const url = event.params.request.url;
      const permitted = url.startsWith(`${origin}/`) || url.startsWith('data:');
      send(permitted ? 'Fetch.continueRequest' : 'Fetch.failRequest', { requestId: event.params.requestId, ...(permitted ? {} : { errorReason: 'BlockedByClient' }) }).catch(() => {});
    }
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Log.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  // Preserve explicit QA silence across native internal-link navigation, without changing link hrefs.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(origin)}){const u=new URL(location.href);u.searchParams.set('dc_qa','1');u.searchParams.set('dc_analytics','off');history.replaceState(null,'',u.href);}` });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__qaLcp=[];new PerformanceObserver(list=>window.__qaLcp.push(...list.getEntries().map(e=>({time:e.startTime,size:e.size,tag:e.element?.tagName,text:e.element?.textContent?.slice(0,100)})))).observe({type:'largest-contentful-paint',buffered:true});` });
  for (const width of [390, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 });
    await send('Emulation.setTouchEmulationEnabled', { enabled: width === 390 });
    for (const route of ['/', '/rental-property-calculator/', '/methodology/']) {
      await send('Page.navigate', { url: `${origin}${route}?dc_qa=1&dc_analytics=off` });
      await delay(1500);
      const row = await evaluate(`(() => {const nav=performance.getEntriesByType('navigation')[0];return {url:location.href,width:innerWidth,documentWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,title:document.title,lcp:window.__qaLcp,ttfb:nav.responseStart-nav.startTime,domReady:nav.domContentLoadedEventEnd,load:nav.loadEventEnd,gaLoaded:Boolean(window.__dealcookerGaLoaded),resourceBytes:performance.getEntriesByType('resource').map(r=>({name:r.name,bytes:r.encodedBodySize})),cta:[...document.querySelectorAll('a')].filter(a=>a.href.startsWith('https://www.dealcooker.app/')).map(a=>({text:a.textContent.trim(),href:a.href})),brokenImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src)}})()`);
      const screenshot = path.join(output, `${route === '/' ? 'home' : route === '/methodology/' ? 'methodology' : 'rental'}-${width}.png`);
      fs.writeFileSync(screenshot, Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'));
      if (route === '/') {
        await evaluate(`document.querySelector('.cash-bars').scrollIntoView({block:'center'})`);
        await delay(200);
        row.previewBarHeights = await evaluate(`[...document.querySelectorAll('.cash-bars i')].map(e=>e.getBoundingClientRect().height)`);
        fs.writeFileSync(path.join(output, `preview-${width}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'));
      }
      if (route === '/rental-property-calculator/') {
        const bounds = await evaluate(`(() => {const s=document.querySelector('.rental-checklist');if(!s)return null;const r=s.getBoundingClientRect();return {x:0,y:r.top+scrollY,width:innerWidth,height:r.height}})()`);
        assert.ok(bounds, 'Approved rental guidance must render');
        fs.writeFileSync(path.join(output, `rental-checklist-${width}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...bounds, scale: 1 } })).data, 'base64'));
        // Avoid measuring an in-flight smooth scroll on this long mobile section.
        await evaluate(`document.querySelector('.rental-checklist .button').scrollIntoView({block:'center',behavior:'instant'})`);
        await delay(200);
        row.rentalChecklist = await evaluate(`(() => {const s=document.querySelector('.rental-checklist');const a=s.querySelector('.button');const r=a.getBoundingClientRect();return {heading:s.querySelector('h2').textContent,link:a.href,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('a')===a,listItems:s.querySelectorAll('li').length}})()`);
        fs.writeFileSync(path.join(output, `rental-cta-${width}.json`), JSON.stringify({ ...row.rentalChecklist, geometry: await evaluate(`(() => {const a=document.querySelector('.rental-checklist .button');const r=a.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scrollY,innerHeight,scrollBehavior:getComputedStyle(document.documentElement).scrollBehavior,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML?.slice(0,250)}})()`) }, null, 2));
        fs.writeFileSync(path.join(output, `rental-cta-${width}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
        assert.equal(row.rentalChecklist.listItems, 4);
        assert.equal(row.rentalChecklist.hit, true, 'Rental CTA must be an unclipped pointer target');
        assert.equal(row.rentalChecklist.link, 'https://www.dealcooker.app/?utm_source=dealcooker_landing&utm_medium=organic&utm_campaign=seo_strategy_page&utm_content=rental&strategy=longTerm');
      }
      if (route === '/methodology/') {
        const bounds = await evaluate(`(() => {const s=document.querySelector('#compare-metrics');if(!s)return null;const r=s.getBoundingClientRect();return {x:0,y:r.top+scrollY,width:innerWidth,height:r.height}})()`);
        assert.ok(bounds, 'Metric comparison guide must render');
        fs.writeFileSync(path.join(output, `metric-guide-full-${width}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...bounds, scale: 1 } })).data, 'base64'));
        await evaluate(`document.querySelector('#compare-metrics').scrollIntoView({block:'start',behavior:'instant'})`);
        fs.writeFileSync(path.join(output, `metric-guide-top-${width}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
        row.metricGuide = await evaluate(`(() => {const s=document.querySelector('#compare-metrics');return {heading:s.querySelector('h2').textContent,cards:s.querySelectorAll('article').length,steps:s.querySelectorAll('li').length,links:[...s.querySelectorAll('a')].map(a=>a.getAttribute('href'))}})()`);
        assert.equal(row.metricGuide.cards, 4);
        assert.equal(row.metricGuide.steps, 3);
        row.metricGuide.nativeTargets = [];
        for (const [index, targetRoute] of ['/rental-property-calculator/', '/brrrr-calculator/'].entries()) {
          if (index) { await send('Page.navigate', { url: `${origin}/methodology/?dc_qa=1&dc_analytics=off` }); await delay(500); }
          await evaluate(`document.querySelectorAll('#compare-metrics a')[${index}].scrollIntoView({block:'center',behavior:'instant'})`);
          const target = await evaluate(`(() => {const a=document.querySelectorAll('#compare-metrics a')[${index}];const r=a.getClientRects()[0];const x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:document.elementFromPoint(x,y)?.closest('a')===a,href:a.getAttribute('href')}})()`);
          assert.equal(target.hit, true, 'Worked-example link must be an unclipped native target');
          fs.writeFileSync(path.join(output, `metric-guide-links-${index}-${width}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
          if (width === 390) {
            await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: target.x, y: target.y }] });
            await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          } else {
            await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.x, y: target.y, button: 'left', clickCount: 1 });
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x, y: target.y, button: 'left', clickCount: 1 });
          }
          await delay(750);
          const destination = await evaluate(`({pathname:location.pathname,hash:location.hash,qa:new URL(location.href).searchParams.get('dc_qa'),gaLoaded:Boolean(window.__dealcookerGaLoaded),heading:document.querySelector('#worked-example h2')?.textContent})`);
          assert.equal(destination.pathname, targetRoute);
          assert.equal(destination.hash, '#worked-example');
          assert.equal(destination.qa, '1');
          assert.equal(destination.gaLoaded, false);
          assert.equal(destination.heading, 'Follow the assumptions into the result.');
          row.metricGuide.nativeTargets.push({ ...target, destination });
          fs.writeFileSync(path.join(output, `metric-guide-destination-${index}-${width}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
        }
      }
      rows.push({ ...row, screenshot });
    }
  }
  const result = { rows, requests, exceptions, violations, analyticsRequests: requests.filter(url => /google-analytics|googletagmanager|\/api\/analytics/.test(url)), limits: 'One unthrottled synthetic browser sample per viewport/page; not field Core Web Vitals, search impact or human usability study.' };
  fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (process.argv[3]) {
    assert.equal(result.analyticsRequests.length, 0, 'QA must not attempt analytics');
    assert.equal(exceptions.length, 0, 'No browser exceptions');
    assert.equal(violations.length, 0, 'No CSP or resource errors');
    for (const row of rows) {
      assert.ok(row.scrollWidth <= row.documentWidth, 'No horizontal overflow');
      assert.equal(row.gaLoaded, false, 'GA must remain suppressed');
      assert.equal(row.brokenImages.length, 0, 'Images must load');
      if (row.previewBarHeights) {
        assert.equal(row.previewBarHeights.length, 8);
        assert.ok(row.previewBarHeights.every(h=>h>0), 'CSP must not collapse preview bars');
      }
    }
  }
} finally {
  if (send) { try { await send('Browser.close'); cleanup = true; } catch {} }
  if (ws) ws.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (cleanup) {
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
  }
  fs.writeFileSync(path.join(output, 'cleanup.json'), JSON.stringify({ browserCloseAccepted: cleanup, childExitCode: child.exitCode, profile }, null, 2));
}
