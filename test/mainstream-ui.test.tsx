import { render, screen, fireEvent, within, renderHook, act } from '@testing-library/react';
import { useDealEditor } from '@/lib/use-deal-editor';
import { describe, expect, it, vi } from 'vitest';
import { defaultDealInput } from '@/lib/models/deal';
import { calculateDeal } from '@/lib/engine/deal-engine';
import { DecisionBrief } from '@/components/dashboard/decision-brief';
import { KpiCard } from '@/components/ui/kpi-card';
import { DealQuickStart } from '@/components/dashboard/deal-quick-start';

describe('Mainstream decision summary', () => {
  it('shows a money explanation and lets the author explicitly review assumptions', () => {
    const model = structuredClone(defaultDealInput);
    model.purchase.dealName = 'Real property';
    const onChange = vi.fn();
    render(<DecisionBrief model={model} strategy="longTerm" output={calculateDeal(model).longTerm} onChange={onChange} />);
    const summary = screen.getByRole('region',{ name:'Deal decision summary' });
    expect(within(summary).getByText('Where the monthly money goes')).toBeInTheDocument();
    expect(within(summary).getByText(/Placement fee is not included/)).toBeInTheDocument();
    fireEvent.click(within(summary).getByText(/Check assumptions/));
    fireEvent.click(within(summary).getByRole('button',{name:'I reviewed these assumptions'}));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({analysis:expect.objectContaining({assumptionsReviewed:true})}));
    expect(model.analysis?.assumptionsReviewed).not.toBe(true);
  });
});


it('opens conservative/base/optimistic comparisons and keeps the original inputs intact', () => {
  const model = structuredClone(defaultDealInput);
  const before = structuredClone(model);
  render(<DecisionBrief model={model} strategy="longTerm" output={calculateDeal(model).longTerm} onChange={vi.fn()} />);
  fireEvent.click(screen.getByText('What if income or costs change?'));
  expect(screen.getByText('Conservative')).toBeInTheDocument();
  expect(screen.getByText('Optimistic')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('spinbutton',{name:'Conservative income change %'}),{target:{value:'-20'}});
  expect(screen.getByRole('spinbutton',{name:'Conservative income change %'})).toHaveValue(-20);
  expect(model).toEqual(before);
});



it('guides a first rental through property and costs to a provisional result', () => {
  const onStart = vi.fn();
  render(<DealQuickStart base={defaultDealInput} onStart={onStart} onSample={vi.fn()} onAdvanced={vi.fn()} />);
  expect(screen.getByRole('button',{name:'Try a sample property'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/^Rent out a home/}));
  fireEvent.change(screen.getByRole('spinbutton',{name:'Purchase price'}),{target:{value:'300000'}});
  fireEvent.change(screen.getByRole('spinbutton',{name:'Expected monthly rent'}),{target:{value:'3000'}});
  fireEvent.click(screen.getByRole('button',{name:'Next: costs'}));
  fireEvent.click(screen.getByRole('button',{name:'See my provisional result'}));
  expect(onStart).toHaveBeenCalledWith(expect.objectContaining({purchase:expect.objectContaining({purchasePrice:300000}),longTerm:expect.objectContaining({grossRentMonthly:3000}),analysis:expect.objectContaining({kind:'property',assumptionsReviewed:false})}),'longTerm');
});



it('can undo a workout price change while preserving other deal inputs', () => {
  const model = structuredClone(defaultDealInput);
  model.purchase.purchasePrice = 200000;
  model.analysis = {lastWorkout:{purchasePrice:250000,downPaymentPercent:0.2}};
  const onChange = vi.fn();
  render(<DecisionBrief model={model} strategy="longTerm" output={calculateDeal(model).longTerm} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button',{name:'Undo last workout change'}));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({purchase:expect.objectContaining({purchasePrice:250000,downPaymentPercent:0.2}),longTerm:model.longTerm}));
});



it('shows actual monthly flip holding exposure rather than a zero placeholder', () => {
  const model = structuredClone(defaultDealInput);
  Object.assign(model.purchase,{financingType:'cash',helocAmount:0,propertyTaxAnnualOverride:0,insuranceAnnualOverride:0,hoaMonthly:0,pmiMonthly:0});
  model.flip.hardMoneyEnabled=false;
  model.variableExpenses=model.variableExpenses.map((e,index)=>({...e,monthlyAmount:index===0?100:0,appliesTo:{...e.appliesTo,flip:true}}));
  render(<DecisionBrief model={model} strategy="flip" output={calculateDeal(model).flip} />);
  expect(screen.getByText('Monthly holding exposure').parentElement).toHaveTextContent('$100');
});



it('invalidates assumption review only when financial inputs change', () => {
  const initial = structuredClone(defaultDealInput);
  initial.analysis={assumptionsReviewed:true};
  const dirty=vi.fn();
  const {result}=renderHook(()=>useDealEditor(()=>initial,dirty));
  act(()=>result.current.updateModel(current=>({...current,purchase:{...current.purchase,purchasePrice:123456}})));
  expect(result.current.model.analysis?.assumptionsReviewed).toBe(false);
  act(()=>result.current.updateModel(current=>({...current,analysis:{...current.analysis,assumptionsReviewed:true}})));
  expect(result.current.model.analysis?.assumptionsReviewed).toBe(true);
  expect(dirty).toHaveBeenCalledTimes(2);
});



it('puts the exact monthly bottom line before the money breakdown',()=>{
  const model=structuredClone(defaultDealInput);
  const output=calculateDeal(model).longTerm;
  render(<DecisionBrief model={model} strategy="longTerm" output={output} />);
  const headline=screen.getByLabelText('Estimated monthly cash flow');
  expect(headline).toHaveTextContent(new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(output.monthlyCashFlow));
  expect(headline.compareDocumentPosition(screen.getByText('Where the monthly money goes')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});



it('keeps cash labels readable rather than truncating them',()=>{
 render(<KpiCard label="Cash to Close" value="$66,900" layout="inline" />);
 expect(screen.getByText('Cash to Close')).not.toHaveClass('truncate');
});



it('accepts quoted fractional financing rates and cents in first-deal costs',()=>{
 const onStart=vi.fn();
 render(<DealQuickStart base={structuredClone(defaultDealInput)} onStart={onStart} onSample={vi.fn()} onAdvanced={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:/^Rent out a home/}));
 for(const [label,value] of [['Purchase price','200000'],['Expected monthly rent','2200'],['Down payment %','3.5'],['Interest rate %','6.875']]) {
  const input=screen.getByLabelText(label) as HTMLInputElement;
  fireEvent.change(input,{target:{value}});
  expect(input.validity.valid,label).toBe(true);
 }
 fireEvent.click(screen.getByRole('button',{name:'Next: costs'}));
 for(const [label,value] of [['Annual property tax','2134.56'],['Annual insurance','1789.50'],['Other operating costs / month','150.25'],['Upfront rehab budget','12780.90']]) {
  const input=screen.getByLabelText(label) as HTMLInputElement;
  fireEvent.change(input,{target:{value}});
  expect(input.validity.valid,label).toBe(true);
 }
 fireEvent.click(screen.getByRole('button',{name:'See my provisional result'}));
 expect(onStart).toHaveBeenCalledOnce();
 expect(onStart.mock.calls[0][0].purchase.propertyTaxAnnualOverride).toBe(2134.56);
});



it('does not round the displayed highest feasible offer above its verified cents',()=>{
 const model=structuredClone(defaultDealInput);
 const output=calculateDeal(model).flip;
 output.calculationBreakdown!.flipMeta!.maxAllowableOffer=100000.75;
 render(<DecisionBrief model={model} strategy="flip" output={output}/>);
 expect(screen.getByText('Highest offer meeting all targets').parentElement).toHaveTextContent('$100,000.75');
});
