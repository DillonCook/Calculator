import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { PrintActions } from '@/components/print/print-actions';
import { createScenarioRecord,encodeScenario } from '@/lib/scenario-storage';
import { buildSampleDealPayload } from '@/lib/deal-templates';
it('allows the printed decision explanation to continue on page one',()=>{
 const css=readFileSync('app/mainstream.css','utf8');
 expect(css).toMatch(/@media print/);
 expect(css).toMatch(/\.decision-brief\{break-inside:auto;/);
});

it('keeps the first print-action render identical before browser hydration',()=>{
 const scenarioToken=encodeScenario(createScenarioRecord(buildSampleDealPayload()));
 const html=renderToString(createElement(PrintActions,{scenarioToken,strategy:'longTerm'}));
 expect(html).not.toContain('Open Editable Deal');
 expect(html).toContain('Copy Shareable Link');
});
