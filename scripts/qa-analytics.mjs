// Analytics-silent built-app smoke test. Never probe ordinary production traffic.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import WebSocket from 'ws';

const url = new URL(process.argv[2] || 'http://127.0.0.1:3027/');
if (!['http://127.0.0.1:3027', 'https://www.dealcooker.app'].includes(url.origin) || url.pathname !== '/') {
  throw new Error('Only the local QA app or canonical production root is supported.');
}
url.searchParams.set('dc_qa', '1');
url.searchParams.set('dc_analytics', 'off');
const output = path.resolve(process.argv[3] || path.join(os.tmpdir(), 'dealcooker-qa-results'));
fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dealcooker-analytics-qa-'));
const debugPort = 9337;
const child = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--disable-background-networking', '--no-first-run',
  '--no-default-browser-check', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const readTargets = () => new Promise((resolve, reject) => {
  http.get(`http://127.0.0.1:${debugPort}/json`, response => {
    let body = '';
    response.on('data', chunk => { body += chunk; });
    response.on('end', () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } });
  }).on('error', reject);
});
let ws;
try {
  let target;
  for (let attempt = 0; attempt < 40 && !target; attempt++) {
    try { target = (await readTargets()).find(item => item.type === 'page'); } catch {}
    if (!target) await pause(100);
  }
  if (!target) throw new Error('Isolated QA Chrome did not become ready.');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let id = 0;
  const pending = new Map();
  const analyticsRequests = [];
  const exceptions = [];
  ws.on('message', raw => {
    const message = JSON.parse(String(raw));
    if (message.method === 'Network.requestWillBeSent' && /\/api\/analytics\/events|google-analytics\.com|googletagmanager\.com/.test(message.params.request.url)) {
      analyticsRequests.push(message.params.request.url);
    }
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject, timer } = pending.get(message.id);
    clearTimeout(timer);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(requestId, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');
  const results = [];
  for (const width of [1440, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: width === 390 ? 844 : 1000, deviceScaleFactor: 1, mobile: width === 390 });
    await send('Page.navigate', { url: url.href });
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await evaluate("document.readyState === 'complete' && !!document.querySelector('button')")) break;
      await pause(100);
    }
    await pause(750);
    const sampleClicked = await evaluate("(() => {const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Try a sample property');if(b)b.click();return !!b;})()");
    await pause(600);
    if (width === 390) {
      await evaluate("(() => {document.querySelector('[aria-label=\"Dismiss install prompt\"]')?.click(); const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Results' && x.getClientRects().length);b?.click();})()");
      await pause(400);
    }
    const result = await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,gaLoaded:!!window.__dealcookerGaLoaded,trackingKeys:Object.keys(localStorage).filter(x=>/analytics|milestones/.test(x)),sampleVisible:document.body.innerText.includes('FICTIONAL SAMPLE'),errors:performance.getEntriesByType('resource').filter(x=>/api\\/analytics\\/events/.test(x.name)).map(x=>x.name)})`);
    result.sampleClicked = sampleClicked;
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    result.screenshot = path.join(output, `qa-${width}.png`);
    fs.writeFileSync(result.screenshot, Buffer.from(screenshot.data, 'base64'));
    results.push(result);
  }
  const passed = analyticsRequests.length === 0 && exceptions.length === 0 && results.every(result => result.sampleVisible && result.scrollWidth <= result.width && !result.gaLoaded && result.trackingKeys.length === 0 && result.errors.length === 0);
  const receipt = { url: url.href, generatedAt: new Date().toISOString(), passed, analyticsRequests, exceptions, results };
  fs.writeFileSync(path.join(output, 'browser-smoke.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  if (ws) ws.close();
  child.kill();
  await pause(400);
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }); } catch {}
}
