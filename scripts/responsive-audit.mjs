import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import WebSocket from 'ws';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9333;
const sitePort = 4318;
const siteRoot = path.resolve('landing-dist');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dealcooker-chrome-'));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const siteServer = http.createServer((request, response) => {
  const pathname = new URL(request.url || '/', `http://127.0.0.1:${sitePort}`).pathname;
  const relative = pathname === '/' ? 'index.html' : pathname.endsWith('/') ? `${pathname.slice(1)}index.html` : pathname.slice(1);
  const resolved = path.resolve(siteRoot, relative);
  if (!resolved.startsWith(siteRoot) || !fs.existsSync(resolved)) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': mime[path.extname(resolved)] || 'application/octet-stream' });
  fs.createReadStream(resolved).pipe(response);
});
await new Promise((resolve) => siteServer.listen(sitePort, '127.0.0.1', resolve));
const child = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore' });

const getJson = (url) => new Promise((resolve, reject) => {
  http.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => { try { resolve(JSON.parse(data)); } catch (error) { reject(error); } });
  }).on('error', reject);
});

const waitForTarget = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await getJson(`http://127.0.0.1:${port}/json`);
      const target = targets.find((item) => item.type === 'page');
      if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Chrome DevTools target did not become ready');
};

const ws = new WebSocket(await waitForTarget());
await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
let nextId = 1;
const pending = new Map();
ws.on('message', (data) => {
  const message = JSON.parse(String(data));
  if (!message.id || !pending.has(message.id)) return;
  const handlers = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) handlers.reject(new Error(message.error.message)); else handlers.resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return result.result.value;
};

const viewports = [320, 390, 768, 1024, 1440];
const routes = [
  '/',
  '/rental-property-calculator/',
  '/brrrr-calculator/',
  '/room-by-room-rental-calculator/',
  '/airbnb-investment-calculator/',
  '/fix-and-flip-calculator/',
  '/commercial-real-estate-calculator/',
  '/compare-rental-strategies/'
];
const failures = [];
await send('Page.enable');
await send('Runtime.enable');

for (const width of viewports) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width <= 768 });
  for (const route of routes) {
    await send('Page.navigate', { url: `http://127.0.0.1:${sitePort}${route}` });
    await new Promise((resolve) => setTimeout(resolve, 350));
    const result = await evaluate(`(() => {
      const vw = document.documentElement.clientWidth;
      const all = [...document.querySelectorAll('body *')].filter((el) => {
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length;
      });
      const offenders = all.map((el) => {
        const r = el.getBoundingClientRect();
        const parent = el.parentElement;
        const parentScrollable = parent && parent.scrollWidth > parent.clientWidth + 1 && ['auto','scroll'].includes(getComputedStyle(parent).overflowX);
        const scrollable = (el.scrollWidth > el.clientWidth + 1 && ['auto','scroll'].includes(getComputedStyle(el).overflowX)) || Boolean(parentScrollable);
        const decorative = el.classList.contains('hero-glow');
        return { tag: el.tagName, cls: String(el.className || ''), text: (el.textContent || '').trim().slice(0, 80), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), scrollable, decorative };
      }).filter((r) => !r.scrollable && !r.decorative && (r.right > vw + 1 || r.left < -1)).slice(0, 12);
      const h = document.querySelector('h1')?.getBoundingClientRect();
      const primaryCta = document.querySelector('.hero .button-primary,.strategy-hero .button-primary')?.getBoundingClientRect();
      return { vw, scrollWidth: document.documentElement.scrollWidth, offenders, headline: h ? { left: Math.round(h.left), right: Math.round(h.right), width: Math.round(h.width) } : null, primaryCtaBottom: primaryCta ? Math.round(primaryCta.bottom) : null };
    })()`);
    const overflow = result.scrollWidth > result.vw + 1 || result.offenders.length > 0;
    const desktopCtaBelowFold = width === 1440 && result.primaryCtaBottom > 880;
    console.log(JSON.stringify({ width, route, overflow, desktopCtaBelowFold, ...result }));
    if (overflow || desktopCtaBelowFold) failures.push({ width, route, result, desktopCtaBelowFold });
  }
}

ws.close();
child.kill();
await new Promise((resolve) => siteServer.close(resolve));
await new Promise((resolve) => setTimeout(resolve, 250));
try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }); } catch {}
if (failures.length) {
  console.error(`Responsive audit found ${failures.length} layout failure(s).`);
  process.exitCode = 1;
} else {
  console.log('Responsive audit passed at 320, 390, 768, 1024, and 1440px.');
}
