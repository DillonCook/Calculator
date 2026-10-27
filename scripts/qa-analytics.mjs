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
const firstUse = process.argv[4] === '--first-use';
const inputHelp = process.argv[4] === '--input-help';
const shareFallback = process.argv[4] === '--share-fallback';
const reportLaunch = process.argv[4] === '--report-launch';
const reportShareFallback = process.argv[4] === '--report-share-fallback' || reportLaunch;
if (process.argv[4] && !firstUse && !inputHelp && !shareFallback && !reportShareFallback) throw new Error('Unknown QA journey.');
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
  // Only the temporary, isolated QA profile is cleared; never a user's browser.
  if (firstUse) await send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear();' });
  if (shareFallback || reportShareFallback) await send('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new DOMException('Synthetic QA clipboard denial','NotAllowedError')}}});" });
  const results = [];
  let sampleReportHref;
  for (const width of [1440, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: width === 390 ? 844 : 1000, deviceScaleFactor: 1, mobile: width === 390 });
    await send('Page.navigate', { url: url.href });
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await evaluate("document.readyState === 'complete' && !!document.querySelector('button')")) break;
      await pause(100);
    }
    await pause(750);
    const journey = [];
    const snapshot = async stage => {
      const state = await evaluate(`({stage:${JSON.stringify(stage)},text:document.body.innerText,heading:document.querySelector('.deal-quick-start h2')?.textContent,active:{tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label'),text:(document.activeElement?.innerText||document.activeElement?.closest('label')?.textContent||'').slice(0,160)},invalid:[...document.querySelectorAll('.deal-quick-start input')].filter(x=>!x.validity.valid).map(x=>({label:x.closest('label')?.textContent,message:x.validationMessage})),inputs:[...document.querySelectorAll('.deal-quick-start input')].map(x=>({label:x.closest('label')?.textContent,value:x.value})),scrollY})`);
      Object.assign(state, await evaluate(`(() => {const h=document.querySelector('.deal-quick-start h2');const help=h?.nextElementSibling;const visible=el=>{const r=el?.getBoundingClientRect();return !!r && r.top>=0 && r.bottom<=innerHeight;};return {headingFocused:!!h && document.activeElement===h,headingVisible:visible(h),helpVisible:visible(help)};})()`));
      const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      state.screenshot = path.join(output, `journey-${width}-${stage}.png`);
      fs.writeFileSync(state.screenshot, Buffer.from(image.data, 'base64'));
      journey.push(state);
    };
    const click = async label => {
      const found = await evaluate(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.getClientRects().length && (x.getAttribute('aria-label') || x.textContent.trim())===${JSON.stringify(label)});if(b)b.focus();return !!b;})()`);
      if (!found) throw new Error(`Visible control missing: ${label}`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await pause(350);
    };
    const fill = async (label, value) => {
      const found = await evaluate(`(() => {const input=[...document.querySelectorAll('.deal-quick-start label')].find(x=>x.firstChild?.textContent===${JSON.stringify(label)})?.querySelector('input');if(!input)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
      if (!found) throw new Error(`Input missing: ${label}`);
      await pause(100);
    };
    const pointer = async (label, touch = false) => {
      const point = await evaluate(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.getClientRects().length && (x.getAttribute('aria-label') || x.textContent.trim())===${JSON.stringify(label)});if(!b)return null;b.scrollIntoView({block:'center',behavior:'instant'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      if (!point) throw new Error(`Visible pointer control missing: ${label}`);
      if (touch) {
        await send('Emulation.setTouchEmulationEnabled',{enabled:true});
        await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
        await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      } else {
        await send('Input.dispatchMouseEvent', {type:'mousePressed', ...point, button:'left', clickCount:1});
        await send('Input.dispatchMouseEvent', {type:'mouseReleased', ...point, button:'left', clickCount:1});
      }
      await pause(350);
    };
    let sampleClicked = false;
    if (firstUse) {
      await snapshot('start');
      await click('Rent out a homeMonthly income and cash required');
      await snapshot('property');
      await click('Next: costs');
      await snapshot('required');
      await fill('Purchase price', '-1');
      await fill('Expected monthly rent', '3000');
      await click('Next: costs');
      await snapshot('invalid-price');
      await fill('Property nickname', 'Synthetic QA rental');
      await fill('Purchase price', '300000');
      await fill('Down payment %', '20');
      await fill('Interest rate %', '6.875');
      await click('Next: costs');
      await snapshot('costs');
      await fill('Annual property tax', '2134.56');
      await fill('Annual insurance', '1789.50');
      await fill('Other operating costs / month', '150.25');
      await fill('Upfront rehab budget', '12780.90');
      await click('Back');
      await snapshot('back');
      await click('Next: costs');
      await snapshot('costs-retained');
      await pointer('Back');
      await snapshot('pointer-back');
      await pointer('Back');
      await snapshot('pointer-goal');
      await pointer('Rent out a homeMonthly income and cash required');
      await snapshot('pointer-property');
      await pointer('Next: costs');
      await snapshot('pointer-costs');
      await click('See my provisional result');
      await snapshot('submitted');
    } else {
      sampleClicked = await evaluate("(() => {const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Try a sample property');if(b)b.click();return !!b;})()");
    }
    await pause(600);
    if (width === 390) {
      await evaluate("(() => {document.querySelector('[aria-label=\"Dismiss install prompt\"]')?.click(); const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Results' && x.getClientRects().length);b?.click();})()");
      await pause(400);
    }
    const result = await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,gaLoaded:!!window.__dealcookerGaLoaded,trackingKeys:Object.keys(localStorage).filter(x=>/analytics|milestones/.test(x)),sampleVisible:document.body.innerText.includes('FICTIONAL SAMPLE'),errors:performance.getEntriesByType('resource').filter(x=>/api\\/analytics\\/events/.test(x.name)).map(x=>x.name)})`);
    if (inputHelp) {
      // Exercise native pointer/focus/click order, not HTMLElement.click alone.
      await evaluate(`(() => {document.querySelector('[aria-label="Dismiss install prompt"]')?.click();const b=[...document.querySelectorAll('button')].find(x=>x.getClientRects().length && x.textContent.trim()==='Build');b?.click();})()`);
      await pause(300);
      await evaluate(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.getClientRects().length && (x.getAttribute('aria-label')||x.textContent.trim()).startsWith('Expenses'));if(!b)throw Error('Expenses tab missing');b.click();})()`);
      await pause(300);
      const selector = 'button[aria-label="More info about Auto Tax %"]';
      const point = await evaluate(`(() => {const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(x=>x.getClientRects().length);if(!b)throw Error('Visible tax help missing');b.scrollIntoView({block:'center',behavior:'instant'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      const fieldValues = () => evaluate(`JSON.stringify([...document.querySelectorAll('input')].filter(x=>x.getClientRects().length).map(x=>[x.getAttribute('aria-label'),x.value]))`);
      const before = await fieldValues();
      if (width === 390) {
        await send('Emulation.setTouchEmulationEnabled', {enabled:true});
        await send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[point]});
        await send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
      } else {
        await send('Input.dispatchMouseEvent', {type:'mouseMoved',...point});
        await send('Input.dispatchMouseEvent', {type:'mousePressed',...point,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent', {type:'mouseReleased',...point,button:'left',clickCount:1});
      }
      await pause(250);
      result.help = await evaluate(`(() => {const d=[...document.querySelectorAll('[role="dialog"]')].find(x=>x.textContent.includes('automatic annual property tax'));const r=d?.getBoundingClientRect();return {pointerOpened:!!d,text:d?.textContent,inViewport:!!r && r.top>=0 && r.left>=0 && r.bottom<=innerHeight && r.right<=innerWidth};})()`);
      const helpImage = await send('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
      result.help.screenshot = path.join(output, `help-${width}.png`);
      fs.writeFileSync(result.help.screenshot, Buffer.from(helpImage.data,'base64'));
      await send('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await send('Input.dispatchKeyEvent', {type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await pause(150);
      result.help.escapeClosed = await evaluate(`!document.querySelector('.tooltip-surface[role="dialog"]')`);
      await evaluate(`(() => {const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(x=>x.getClientRects().length);b.blur();b.focus();})()`);
      await send('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13});
      await send('Input.dispatchKeyEvent', {type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      await pause(250);
      result.help.keyboardOpened = await evaluate(`!!document.querySelector('.tooltip-surface[role="dialog"]')`);
      await send('Input.dispatchMouseEvent', {type:'mousePressed',x:2,y:2,button:'left',clickCount:1});
      await send('Input.dispatchMouseEvent', {type:'mouseReleased',x:2,y:2,button:'left',clickCount:1});
      await pause(150);
      result.help.outsideClosed = await evaluate(`!document.querySelector('.tooltip-surface[role="dialog"]')`);
      result.help.inputsUnchanged = before === await fieldValues();
      result.help.passed = result.help.pointerOpened && result.help.inViewport && result.help.escapeClosed && result.help.keyboardOpened && result.help.outsideClosed && result.help.inputsUnchanged;
      await send('Emulation.setTouchEmulationEnabled', {enabled:false});
      Object.assign(result, await evaluate(`({gaLoaded:!!window.__dealcookerGaLoaded,trackingKeys:Object.keys(localStorage).filter(x=>/analytics|milestones/.test(x))})`));
    }
    if (shareFallback) {
      await evaluate(`document.querySelector('[aria-label="Dismiss install prompt"]')?.click()`);
      if (width===390) await pointer('Open settings');
      await pointer('Send link');
      const readFallback = () => evaluate(`(() => {const f=document.querySelector('textarea[aria-label="Share link"]');const r=f?.getBoundingClientRect();const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='Dismiss share message');const br=b?.getBoundingClientRect();const hittable=(el,rect)=>!!el && !!rect && el.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));return {message:document.body.innerText.includes('Copy failed. Use this link manually.'),present:!!f,length:f?.value.length ?? 0,readOnly:f?.readOnly ?? false,selected:!!f && f.selectionStart===0 && f.selectionEnd===f.value.length,unclipped:hittable(f,r) && hittable(b,br),inViewport:!!r && r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight};})()`);
      const fieldPoint = await evaluate(`(() => {const f=document.querySelector('textarea[aria-label="Share link"]');const r=f?.getBoundingClientRect();return r?{x:r.x+r.width/2,y:r.y+r.height/2}:null;})()`);
      if (fieldPoint) {
        if (width===390) {
          await send('Emulation.setTouchEmulationEnabled',{enabled:true});
          await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[fieldPoint]});
          await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        } else {
          await send('Input.dispatchMouseEvent',{type:'mousePressed',...fieldPoint,button:'left',clickCount:1});
          await send('Input.dispatchMouseEvent',{type:'mouseReleased',...fieldPoint,button:'left',clickCount:1});
        }
        await pause(100);
      }
      result.shareFallback = {initial:await readFallback()};
      await pause(3500);
      result.shareFallback.afterTimeout=await readFallback();
      const recoveryImage=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      result.shareFallback.screenshot=path.join(output,`share-fallback-${width}.png`);
      fs.writeFileSync(result.shareFallback.screenshot,Buffer.from(recoveryImage.data,'base64'));
      const hasDismiss=await evaluate(`!![...document.querySelectorAll('button')].find(x=>x.getClientRects().length && x.textContent.trim()==='Dismiss')`);
      if(hasDismiss) await pointer('Dismiss share message');
      result.shareFallback.dismissed=!(await readFallback()).present;
      result.shareFallback.passed=result.shareFallback.initial.message && result.shareFallback.initial.length>100 && result.shareFallback.initial.readOnly && result.shareFallback.initial.selected && result.shareFallback.initial.inViewport && result.shareFallback.initial.unclipped && result.shareFallback.afterTimeout.unclipped && result.shareFallback.afterTimeout.present && result.shareFallback.dismissed;
      await send('Emulation.setTouchEmulationEnabled',{enabled:false});
      Object.assign(result,await evaluate(`({scrollWidth:document.documentElement.scrollWidth,trackingKeys:Object.keys(localStorage).filter(x=>/analytics|milestones/.test(x))})`));
    }
    let launchedReportHref;
    if (reportLaunch) {
      // Capture browser boundaries only: do not open a real print dialog or an
      // uninstrumented popup. Navigate to the captured exact URL with QA flags below.
      await evaluate(`(() => {window.__qaPrintCalls=0;window.__qaReportUrl=null;window.print=()=>{window.__qaPrintCalls++};window.open=(href)=>{window.__qaReportUrl=String(href);return null;};document.addEventListener('click',e=>{const a=e.target.closest('a[href^="/print?scenario="]');if(a){e.preventDefault();window.__qaReportUrl=a.getAttribute('href');}},true);})()`);
      await evaluate(`document.querySelector('[aria-label="Dismiss install prompt"]')?.click()`);
      if (width===390) {
        await pointer('Open settings',true);
        await pointer('Print to PDF',true);
      } else {
        const point=await evaluate(`(() => {const a=[...document.querySelectorAll('a')].find(x=>x.getClientRects().length && x.getAttribute('aria-label')==='Print to PDF');if(!a)return null;a.scrollIntoView({block:'center',behavior:'instant'});const r=a.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
        if(!point) throw new Error('Visible desktop report link missing.');
        await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
        await pause(350);
      }
      result.reportLaunch=await evaluate(`({url:window.__qaReportUrl,printedCalculator:window.__qaPrintCalls,settingsOpen:!!document.querySelector('[role="dialog"][aria-label="Settings"]')})`);
      launchedReportHref=result.reportLaunch.url;
      result.reportLaunch.passed=typeof launchedReportHref==='string' && launchedReportHref.startsWith('/print?scenario=') && launchedReportHref.includes('&strategy=') && result.reportLaunch.printedCalculator===0;
      const launchImage=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      result.reportLaunch.screenshot=path.join(output,`report-launch-${width}.png`);
      fs.writeFileSync(result.reportLaunch.screenshot,Buffer.from(launchImage.data,'base64'));
      await send('Emulation.setTouchEmulationEnabled',{enabled:false});
    }
    if (reportShareFallback && (!reportLaunch || result.reportLaunch.passed)) {
      // The legacy recovery-only journey can reuse a desktop URL; report-launch
      // must obtain its own URL through each viewport's actual visible action.
      const reportHref = reportLaunch ? launchedReportHref : await evaluate(`document.querySelector('a[href^="/print?scenario="]')?.getAttribute('href')`) || sampleReportHref;
      if (!reportHref) throw new Error('Report link missing from sample deal.');
      sampleReportHref=reportHref;
      const reportUrl = new URL(reportHref, url.origin);
      if (reportUrl.origin!==url.origin || reportUrl.pathname!=='/print') throw new Error('Unexpected report destination.');
      reportUrl.searchParams.set('dc_qa', '1');
      reportUrl.searchParams.set('dc_analytics', 'off');
      await send('Page.navigate', {url:reportUrl.href});
      for (let attempt=0;attempt<50;attempt++) {
        if(await evaluate(`document.readyState==='complete' && !![...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Copy Shareable Link')`)) break;
        await pause(100);
      }
      await pause(750);
      await pointer('Copy Shareable Link',width===390);
      const readRecovery=()=>evaluate(`(() => {const f=document.querySelector('textarea[aria-label="Report share link"]');const b=document.querySelector('button[aria-label="Dismiss report share message"]');const r=f?.getBoundingClientRect();const br=b?.getBoundingClientRect();const hit=(e,r)=>!!e && !!r && e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));return {present:!!f,urlMatches:!!f && f.value===location.href,readOnly:f?.readOnly,selected:!!f && f.selectionStart===0 && f.selectionEnd===f.value.length,inViewport:!!r && r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight,unclipped:hit(f,r)&&hit(b,br),message:document.body.innerText.includes('Could not copy link.'),text:document.body.innerText.slice(0,500)};})()`);
      const field=await evaluate(`(() => {const f=document.querySelector('textarea[aria-label="Report share link"]');f?.scrollIntoView({block:'center',behavior:'instant'});const r=f?.getBoundingClientRect();return r?{x:r.x+r.width/2,y:r.y+r.height/2}:null;})()`);
      if(field) {
        if(width===390) {
          await send('Emulation.setTouchEmulationEnabled',{enabled:true});
          await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[field]});
          await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        } else {
          await send('Input.dispatchMouseEvent',{type:'mousePressed',...field,button:'left',clickCount:1});
          await send('Input.dispatchMouseEvent',{type:'mouseReleased',...field,button:'left',clickCount:1});
        }
        await pause(100);
      }
      result.reportShareFallback={initial:await readRecovery()};
      await pause(3500);
      result.reportShareFallback.afterTimeout=await readRecovery();
      const image=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      result.reportShareFallback.screenshot=path.join(output,`report-share-fallback-${width}.png`);
      fs.writeFileSync(result.reportShareFallback.screenshot,Buffer.from(image.data,'base64'));
      if(await evaluate(`!!document.querySelector('button[aria-label="Dismiss report share message"]')`)) await pointer('Dismiss report share message',width===390);
      result.reportShareFallback.dismissed=!(await readRecovery()).present;
      if (reportLaunch) {
        await evaluate(`window.__qaReportPrintCalls=0;window.print=()=>{window.__qaReportPrintCalls++}`);
        await pointer('Print / Save PDF',width===390);
        result.reportLaunch.reportPrintCalled=await evaluate(`window.__qaReportPrintCalls===1`);
        const pdf=await send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});
        const bytes=Buffer.from(pdf.data,'base64');
        result.reportLaunch.pdf=path.join(output,`report-${width}.pdf`);
        result.reportLaunch.pdfValid=bytes.subarray(0,5).toString()==='%PDF-' && bytes.length>1000;
        fs.writeFileSync(result.reportLaunch.pdf,bytes);
        result.reportLaunch.passed=result.reportLaunch.passed && result.reportLaunch.reportPrintCalled && result.reportLaunch.pdfValid;
      }
      const initial=result.reportShareFallback.initial;
      result.reportShareFallback.passed=initial.present && initial.urlMatches && initial.readOnly && initial.selected && initial.inViewport && initial.unclipped && initial.message && result.reportShareFallback.afterTimeout.unclipped && result.reportShareFallback.dismissed;
      await send('Emulation.setTouchEmulationEnabled',{enabled:false});
      Object.assign(result,await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,gaLoaded:!!window.__dealcookerGaLoaded,trackingKeys:Object.keys(localStorage).filter(x=>/analytics|milestones/.test(x))})`));
    }
    result.sampleClicked = sampleClicked;
    if (firstUse) {
      result.journey = journey;
      result.resultVisible = await evaluate("!!document.querySelector('[aria-label=\"Deal decision summary\"]') && document.body.innerText.includes('Synthetic QA rental')");
      const at = stage => journey.find(item => item.stage === stage);
      const retained = (stage, values) => Object.entries(values).every(([label, value]) => at(stage)?.inputs.some(input => input.label === label && input.value === value));
      result.orientationPassed = ['property','costs','back','costs-retained','pointer-back','pointer-goal','pointer-property','pointer-costs'].every(stage => at(stage)?.headingFocused && at(stage)?.headingVisible && at(stage)?.helpVisible)
        && ['required','invalid-price'].every(stage => at(stage)?.active.tag === 'INPUT' && at(stage)?.active.text === 'Purchase price');
      result.journeyPassed = at('start')?.heading === 'What are you considering?'
        && at('required')?.heading === 'Start with the property.'
        && at('required')?.invalid.some(input => input.label === 'Purchase price')
        && at('invalid-price')?.heading === 'Start with the property.'
        && at('invalid-price')?.invalid.some(input => input.label === 'Purchase price')
        && retained('back', { 'Property nickname': 'Synthetic QA rental', 'Purchase price': '300000', 'Expected monthly rent': '3000', 'Down payment %': '20', 'Interest rate %': '6.875' })
        && retained('costs-retained', { 'Annual property tax': '2134.56', 'Annual insurance': '1789.50', 'Other operating costs / month': '150.25', 'Upfront rehab budget': '12780.90' })
        && !result.sampleVisible && result.orientationPassed;
    }
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    result.screenshot = path.join(output, `qa-${width}.png`);
    fs.writeFileSync(result.screenshot, Buffer.from(screenshot.data, 'base64'));
    results.push(result);
  }
  const passed = analyticsRequests.length === 0 && exceptions.length === 0 && results.every(result => (firstUse ? result.resultVisible && result.journeyPassed : result.sampleVisible) && (!inputHelp || result.help?.passed) && (!shareFallback || result.shareFallback?.passed) && (!reportShareFallback || result.reportShareFallback?.passed) && (!reportLaunch || result.reportLaunch?.passed) && result.scrollWidth <= result.width && !result.gaLoaded && result.trackingKeys.length === 0 && result.errors.length === 0);
  const receipt = { url: url.href, journey: firstUse ? 'blank-rental' : inputHelp ? 'sample-input-help' : shareFallback ? 'sample-share-fallback' : reportLaunch ? 'sample-report-launch' : reportShareFallback ? 'sample-report-share-fallback' : 'sample', generatedAt: new Date().toISOString(), passed, analyticsRequests, exceptions, results };
  fs.writeFileSync(path.join(output, 'browser-smoke.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  if (ws) ws.close();
  child.kill();
  await pause(400);
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }); } catch {}
}
