'use client';

import { useMemo, useState } from 'react';
import { trackProductEvent } from '@/lib/product-analytics';
import type { DealInputModel, StrategyKey, StrategyOutput } from '@/lib/models/deal';
import { getMoneyWaterfall, getCapitalTiming, getDecisionVerdict, getReturnDrivers, applySensitivity, type MoneyRow, type SensitivityChanges } from '@/lib/mainstream-insights';

const money = (value: number) => new Intl.NumberFormat('en-US', { style:'currency',currency:'USD',maximumFractionDigits:0 }).format(value);
const percent = (value: number) => `${(value*100).toFixed(1)}%`;

function MoneyBars({ rows }: { rows: MoneyRow[] }) {
  const scale = Math.max(...rows.map(row=>Math.abs(row.amount)),1);
  return <ol className="money-bars">{rows.map(row=><li key={row.label}>
    <div className="money-bar-caption"><span>{row.label}</span><strong>{money(row.amount)}</strong></div>
    <div className="money-bar-track" aria-hidden="true"><span className={row.amount<0?'money-bar-negative':'money-bar-positive'} style={{width:`${Math.min(Math.abs(row.amount)/scale*100,100)}%`}} /></div>
  </li>)}</ol>;
}

interface Props {
  model: DealInputModel;
  strategy: StrategyKey;
  output: StrategyOutput;
  onChange?: (model: DealInputModel) => void;
}

export function DecisionBrief({ model, strategy, output, onChange }: Props) {
  const verdict = getDecisionVerdict(model,strategy,output);
  const capital = getCapitalTiming(output);
  const flip = output.calculationBreakdown?.flipMeta;
  const period = strategy==='flip' ? `${flip?.holdingMonths ?? model.flip.holdingMonths}-month` : `${model.assumptions.holdYears}-year`;
  const reviewed = model.analysis?.assumptionsReviewed === true;
  const [scenariosOpen,setScenariosOpen] = useState(false);
  const isSample = model.analysis?.kind==='sample' || model.purchase.dealName.includes('Sample Deal');
  const changePreferences = (values: Partial<NonNullable<DealInputModel['analysis']>>) => onChange?.({...model,analysis:{...model.analysis,...values}});
  return <section className="decision-brief" aria-label="Deal decision summary">
    <header className="decision-brief-header">
      <span className="decision-eyebrow">{isSample?'Fictional sample':reviewed?'Assumptions marked reviewed by author':'Provisional • assumptions need review'}</span>
      <h2 data-verdict={verdict.status}>{verdict.label}</h2>
      {strategy!=='flip' ? <div className="decision-monthly-headline"><output aria-label="Estimated monthly cash flow">{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(output.monthlyCashFlow)}</output><span> / month</span><small>Estimated cash after costs and debt payments</small></div> : null}
      <p>Before income tax • modeled reserves included • estimates, not guarantees.</p>
    </header>
    {strategy==='flip' ? <dl className="decision-key-figures">
      <div><dt>Profit over {flip?.holdingMonths ?? model.flip.holdingMonths} months</dt><dd>{money(flip?.netProfit ?? 0)}</dd></div>
      <div><dt>Highest offer meeting all targets</dt><dd>{flip?.maxAllowableOffer == null?(model.flip.targetProfit<=0 && model.flip.targetRoiPercent<=0?'Set an offer target':'No feasible offer'):new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(flip.maxAllowableOffer)}</dd></div>
      <div><dt>Monthly holding exposure</dt><dd>{money((flip?.holdingCostsTotal ?? 0)/Math.max(flip?.holdingMonths ?? 1,1))}</dd></div>
    </dl> : <>
      <h3>Where the monthly money goes</h3>
      {strategy==='brrrr' ? <p className="decision-help">Operating phase shown. Upfront funding and refinance are separate below.</p> : null}
      {output.longTermTurnaroundSummary?.enabled ? <p className="decision-help">Stabilized monthly income shown. This model assumes one year at current income before stabilization.</p> : null}
      <MoneyBars rows={getMoneyWaterfall(output)} />
    </>}
    {model.analysis?.lastWorkout && onChange ? <aside className="decision-warning">
      <p>Last adjustment: price {money(model.analysis.lastWorkout.purchasePrice)} → {money(model.purchase.purchasePrice)}; down payment {percent(model.analysis.lastWorkout.downPaymentPercent)} → {percent(model.purchase.downPaymentPercent)}. Lower debt payments may require more cash upfront. Recheck your goals after any change.</p>
      <button type="button" className="decision-text-button" onClick={()=>onChange({...model,purchase:{...model.purchase,...model.analysis!.lastWorkout},analysis:{...model.analysis,lastWorkout:undefined,assumptionsReviewed:false}})}>Undo last workout change</button>
    </aside> : null}
    <div className="capital-milestones" aria-label="Cash timing">
      <div><span>At the start</span><strong>{money(capital.upfront)}</strong><small>Cash contributed upfront</small></div>
      <div><span>During the hold</span><strong>{money(capital.futureContributions)}</strong><small>Additional modeled contributions</small></div>
      {strategy==='brrrr' ? <div><span>After refinance</span><strong>{money(capital.cashLeftAfterRefinance ?? 0)}</strong><small>Cash left in the deal — not upfront funding</small></div> : null}
      {capital.saleShortfall>0 ? <div><span>At sale</span><strong>{money(capital.saleShortfall)}</strong><small>Additional cash needed to close the sale</small></div> : null}
    </div>
    {capital.excessFunding>0 ? <p className="decision-help">{money(capital.excessFunding)} of borrowed cash remains after funded uses. It is included in the cash ledger, not earned income. The full debt still needs repayment.</p> : null}
    {strategy==='longTerm' && model.longTerm.tenantPlacementFeePercent>0 ? <p className="decision-warning">Placement fee is not included in returns. Add any leasing cost to your expense plan before relying on this result.</p> : null}
    <details className="decision-disclosure">
      <summary>Check assumptions {reviewed?'— marked reviewed':'— estimates remain'}</summary>
      <ul className="decision-assumptions">
        <li data-value-source={model.purchase.propertyTaxAnnualOverride===null?'estimated':'entered'}>Property tax: {model.purchase.propertyTaxAnnualOverride===null?'estimated from the tax-rate assumption. Confirm the post-purchase bill.':'entered annual override; not independently verified.'}</li>
        <li data-value-source={model.purchase.insuranceAnnualOverride===null?'estimated':'entered'}>Insurance: {model.purchase.insuranceAnnualOverride===null?'estimated from the insurance-rate assumption. Get a property-specific quote.':'entered annual override; confirm the quote covers this use.'}</li>
        <li>Income, vacancy, repairs, management and reserves are your assumptions or starting defaults. Check each in Build. A zero cost is not proof it does not apply.</li>
        <li>Listing links suggest a name only. They do not import verified prices, rents or expenses.</li>
        <li>HELOC amount means money actually drawn, not the available credit limit.</li>
      </ul>
      {onChange ? <button type="button" className="btn-primary" onClick={()=>{trackProductEvent('assumptions_reviewed',model,strategy);changePreferences({assumptionsReviewed:true});}}>I reviewed these assumptions</button> : null}
    </details>
    {onChange && strategy!=='flip' ? <details className="decision-disclosure">
      <summary>Set your cash-flow and return goals</summary>
      <div className="decision-form-grid">
        <label>Minimum cash each month<input type="number" min="0" value={model.analysis?.minMonthlyCashFlow ?? 0} onChange={e=>changePreferences({minMonthlyCashFlow:Math.max(Number(e.target.value),0)})} /></label>
        <label>Minimum debt coverage (DSCR)<input type="number" min="0" step="0.05" value={model.analysis?.minDscr ?? 1} onChange={e=>changePreferences({minDscr:Math.max(Number(e.target.value),0)})} /></label>
        <label>Minimum cash-on-cash %<input type="number" min="0" step="0.5" value={(model.analysis?.minCashOnCashPercent ?? 0)*100} onChange={e=>changePreferences({minCashOnCashPercent:Math.max(Number(e.target.value),0)/100})} /></label>
      </div>
      <p className="decision-help">Zero cash-flow/return goals mean break-even only. A debt coverage of 1 means no operating cushion over the payment. Financing suggestions are alternatives to test, not guarantees that every goal is met.</p>
    </details> : null}
    <details className="decision-disclosure" open={scenariosOpen}>
      <summary onClick={e=>{e.preventDefault();if(!scenariosOpen)trackProductEvent('downside_compared',model,strategy);setScenariosOpen(open=>!open);}}>What if income or costs change?</summary>
      {scenariosOpen ? <SensitivityPanel model={model} strategy={strategy} output={output} /> : null}
    </details>
    <details className="decision-disclosure">
      <summary>Understand the {period} return</summary>
      <MoneyBars rows={getReturnDrivers(model,output)} />
      <p className="decision-help">Operating cash is after debt payments. Principal repaid and appreciation build equity, not spendable income. The final row reconciles acquisition, sale and other project costs; these are not independent sources of guaranteed profit.</p>
      <dl className="decision-definitions">
        <div><dt>{period} total return</dt><dd>{percent(output.roi)} — modeled profit divided by all cash contributed.</dd></div>
        <div><dt>Annualized return (IRR)</dt><dd>{percent(output.irr)} — annualized using the dates of cash contributions and distributions; not yearly average profit.</dd></div>
        <div><dt>Cap rate basis</dt><dd>{strategy==='brrrr'?'Operating NOI divided by refinance ARV.':'Annual NOI divided by acquisition price or owned-property basis.'} Reserves follow the modeled expense assumptions.</dd></div>
        <div><dt>Cash-on-cash basis</dt><dd>{strategy==='brrrr'?'Post-refinance annual cash flow divided by cash left after refinance. Zero remaining cash does not mean zero upfront funding.':'Annual modeled cash flow divided by the strategy’s initial cash investment.'} If the denominator is zero, do not interpret a displayed 0% as a measured return.</dd></div>
      </dl>
    </details>
  </section>;
}


function SensitivityPanel({model,strategy,output}: Omit<Props,'onChange'>) {
  const [down,setDown] = useState<SensitivityChanges>({incomePercent:-10,costPercent:10,exitPercent:-10});
  const [up,setUp] = useState<SensitivityChanges>({incomePercent:10,costPercent:-10,exitPercent:10});
  const conservative = useMemo(()=>applySensitivity(model,strategy,down).output,[model,strategy,down]);
  const optimistic = useMemo(()=>applySensitivity(model,strategy,up).output,[model,strategy,up]);
  const value = (result: StrategyOutput) => strategy==='flip' ? result.calculationBreakdown?.flipMeta?.netProfit ?? 0 : result.monthlyCashFlow;
  return <div className="sensitivity-panel">
    <p className="decision-help">Illustrative stress tests, not probabilities. Edit the changes below. Original deal inputs stay unchanged. Debt terms and percentage fee rates stay fixed.</p>
    <dl className="sensitivity-results">{[['Conservative',conservative],['Base',output],['Optimistic',optimistic]].map(([label,result])=><div key={label as string}><dt>{label as string}</dt><dd>{money(value(result as StrategyOutput))}<small>{strategy==='flip'?'profit over the hold':'per month'}</small></dd></div>)}</dl>
    {([['Conservative',down,setDown],['Optimistic',up,setUp]] as const).map(([name,values,setValues])=><fieldset key={name}>
      <legend>{name} changes</legend>
      <div className="decision-form-grid">{([['incomePercent','income'],['costPercent','cost'],['exitPercent','exit value']] as const).map(([key,label])=><label key={key}>{label} change %<input aria-label={`${name} ${label} change %`} type="number" min="-90" max="100" value={values[key]} onChange={e=>setValues({...values,[key]:Math.min(Math.max(Number(e.target.value),-90),100)})}/></label>)}</div>
    </fieldset>)}
    <p className="decision-help">Income changes adjust rent/nightly/weekly rates or an annual-total override. Cost changes adjust entered fixed costs, variable expenses and supported owner costs; flip rehab is also adjusted. Occupancy, percentage fees, financing terms and loan payments are unchanged. Exit changes adjust modeled resale values.</p>
  </div>;
}
