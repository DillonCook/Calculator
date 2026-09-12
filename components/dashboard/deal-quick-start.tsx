'use client';
import { useState } from 'react';
import type { DealInputModel, StrategyKey } from '@/lib/models/deal';

interface Props {
  base: DealInputModel;
  onStart: (model: DealInputModel,strategy: StrategyKey) => void;
  onSample: () => void;
  onAdvanced: () => void;
}
export function DealQuickStart({base,onStart,onSample,onAdvanced}:Props) {
  const [step,setStep] = useState(0);
  const [strategy,setStrategy] = useState<'longTerm'|'airbnb'|'flip'>('longTerm');
  const [name,setName] = useState('');
  const [price,setPrice] = useState('');
  const [income,setIncome] = useState('');
  const [cash,setCash] = useState(false);
  const [down,setDown] = useState(base.purchase.downPaymentPercent*100);
  const [rate,setRate] = useState(Number((base.purchase.interestRate*100).toFixed(3)));
  const [tax,setTax] = useState('');
  const [insurance,setInsurance] = useState('');
  const [other,setOther] = useState('0');
  const [rehab,setRehab] = useState('0');
  const [error,setError] = useState('');
  const next = () => {
    if (!(Number(price)>0) || !(Number(income)>0) || !Number.isFinite(Number(price)) || !Number.isFinite(Number(income))) {setError('Enter a positive purchase price and income or resale estimate.');return;}
    setError('');setStep(2);
  };
  const finish = () => {
    const model = structuredClone(base);
    const monthlyCosts = Math.max(Number(other)||0,0);
    Object.assign(model.purchase, {dealName:name.trim()||'My first property',purchasePrice:Number(price),arv:strategy==='flip'?Number(income):Number(price),rehabBudget:Math.max(Number(rehab)||0,0),financingType:cash?'cash':'loan',downPaymentPercent:Math.min(Math.max(down/100,0),1),interestRate:Math.max(rate/100,0),propertyTaxAnnualOverride:tax===''?null:Math.max(Number(tax)||0,0),insuranceAnnualOverride:insurance===''?null:Math.max(Number(insurance)||0,0)});
    // The aggregate costs field replaces the starter variable-cost rows, not
    // adds to them. Percentage reserves/management and taxes remain separate.
    model.variableExpenses = model.variableExpenses.map(e=>({...e,monthlyAmount:0}));
    if (strategy==='longTerm') Object.assign(model.longTerm,{grossRentMonthly:Number(income),annualRevenueOverride:null,ownerExpensesMonthly:monthlyCosts,turnaround:{...model.longTerm.turnaround,enabled:false}});
    if (strategy==='airbnb') Object.assign(model.airbnb,{annualRevenueOverride:Number(income)*12,ownerExpensesMonthly:monthlyCosts});
    if (strategy==='flip') {
      Object.assign(model.flip,{arvOverride:Number(income),rehabOverride:Math.max(Number(rehab)||0,0)});
      model.variableExpenses.push({key:'quick-start-holding',label:'Other holding costs',monthlyAmount:monthlyCosts,appliesTo:{purchase:false,longTerm:false,airbnb:false,padSplit:false,flip:true}});
    }
    model.analysis={kind:'property',assumptionsReviewed:false};
    onStart(model,strategy);
  };
  return <section className="deal-quick-start" aria-label="Start a property analysis">
    <p className="decision-eyebrow">DealCooker • Free to start • No account needed</p>
    <h2>{step===0?'What are you considering?':step===1?'Start with the property.':'Add the costs you know.'}</h2>
    <p className="decision-help">{step===0?'Get a clear first result. Refine the details when you are ready.':step===1?'Estimates are fine for a first pass. Nothing here is independently verified.':'Unknown tax and insurance use starting rate estimates. Confirm every assumption before making an offer.'}</p>
    <nav className="quick-start-progress" aria-label="First analysis progress">{['Your goal','Property','Costs'].map((label,index)=><span key={label} aria-current={step===index?'step':undefined}>{index+1}. {label}</span>)}</nav>
    {step===0?<>
      <div className="quick-start-goals">{([['longTerm','Rent out a home','Monthly income and cash required'],['airbnb','Vacation rental','Bookings, cleaning and host fees'],['flip','Renovate and sell','Profit, holding costs and maximum offer']] as const).map(([key,label,detail])=><button key={key} type="button" onClick={()=>{setStrategy(key);setStep(1);}}><strong>{label}</strong><span>{detail}</span></button>)}</div>
      <div className="quick-start-actions"><button type="button" className="btn-primary" onClick={onSample}>Try a sample property</button><button type="button" className="decision-text-button" onClick={onAdvanced}>More strategies / advanced workbench</button></div>
    </>:null}
    {step===1?<form onSubmit={e=>{e.preventDefault();next();}}>
      <div className="decision-form-grid">
        <label>Property nickname<input value={name} onChange={e=>setName(e.target.value)} placeholder="Optional" maxLength={120}/></label>
        <label>Purchase price<input type="number" min="0.01" step="any" required value={price} onChange={e=>setPrice(e.target.value)}/></label>
        <label>{strategy==='flip'?'Expected resale value':strategy==='airbnb'?'Expected monthly booking revenue':'Expected monthly rent'}<input type="number" min="0.01" step="any" required value={income} onChange={e=>setIncome(e.target.value)}/></label>
      </div>
      {strategy==='airbnb'?<p className="decision-help">Booking revenue includes cleaning charges, before host fees and taxes. Build lets you refine occupancy, length of stay and cleaner costs.</p>:null}
      <label className="quick-start-checkbox"><input type="checkbox" checked={cash} onChange={e=>setCash(e.target.checked)}/>Pay cash (no purchase loan)</label>
      {!cash?<div className="decision-form-grid"><label>Down payment %<input type="number" min="0" max="100" step="any" value={down} onChange={e=>setDown(Number(e.target.value))}/></label><label>Interest rate %<input type="number" min="0" step="any" value={rate} onChange={e=>setRate(Number(e.target.value))}/></label><p className="decision-help">{base.purchase.loanTermYears}-year loan. Change term and advanced financing in Build.</p></div>:null}
      <div className="quick-start-actions"><button type="button" onClick={()=>setStep(0)}>Back</button><button type="submit" className="btn-primary">Next: costs</button></div>
    </form>:null}
    {step===2?<form onSubmit={e=>{e.preventDefault();finish();}}>
      <div className="decision-form-grid">
        <label>Annual property tax<input type="number" min="0" step="any" value={tax} onChange={e=>setTax(e.target.value)} placeholder="Unknown — use estimate"/></label>
        <label>Annual insurance<input type="number" min="0" step="any" value={insurance} onChange={e=>setInsurance(e.target.value)} placeholder="Unknown — use estimate"/></label>
        <label>Other operating costs / month<input type="number" min="0" step="any" value={other} onChange={e=>setOther(e.target.value)}/></label>
        <label>Upfront rehab budget<input type="number" min="0" step="any" value={rehab} onChange={e=>setRehab(e.target.value)}/></label>
      </div>
      <p className="decision-warning">Other costs start at zero: add utilities, services and other owner-paid costs. Vacancy, management, maintenance, reserves, closing costs and strategy-specific charges still use starting assumptions. The result is provisional.</p>
      <div className="quick-start-actions"><button type="button" onClick={()=>setStep(1)}>Back</button><button type="submit" className="btn-primary">See my provisional result</button></div>
    </form>:null}
    {error?<p role="alert">{error}</p>:null}
  </section>;
}
