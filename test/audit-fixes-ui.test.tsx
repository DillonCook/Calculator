import {render,screen,fireEvent,within} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {defaultDealInput} from '@/lib/models/deal';
import {calculateDeal} from '@/lib/engine/deal-engine';
import {DecisionBrief} from '@/components/dashboard/decision-brief';
import {normalizeDealInput,encodeDealToShareParam,decodeDealFromShareParam} from '@/lib/share-link';
const fixture=()=>{const m=structuredClone(defaultDealInput);m.purchase.dealName='Audit property';m.longTerm.grossRentMonthly=3000;return m;};
it('exposes cash required at sale when an exit shock leaves monthly cash unchanged',()=>{
 const m=fixture();Object.assign(m.purchase,{purchasePrice:100000,arv:100000,rehabBudget:0});m.assumptions.holdYears=1;m.assumptions.annualAppreciationPercent=0;m.assumptions.sellingCostPercent=0;
 render(<DecisionBrief model={m} strategy="longTerm" output={calculateDeal(m).longTerm}/>);
 fireEvent.click(screen.getByText('What if income or costs change?'));
 for(const [name,value] of [['income',0],['cost',0],['exit value',-50]] as const)fireEvent.change(screen.getByLabelText(`Conservative ${name} change %`),{target:{value}});
 const scenario=screen.getByRole('group',{name:'Conservative scenario outcomes'});
 expect(within(scenario).getByText('Cash required at sale').parentElement).not.toHaveTextContent('$0');
 expect(within(scenario).getByText('Total modeled profit')).toBeInTheDocument();
 expect(within(scenario).getByText('1-year hold')).toBeInTheDocument();
});

it('share round trips strip extra undo fields and reject invalid snapshot ranges',()=>{
 const m=fixture();m.analysis={lastWorkout:{purchasePrice:250000,downPaymentPercent:.2,loanTermYears:1000} as NonNullable<typeof m.analysis>['lastWorkout']};
 const decoded=decodeDealFromShareParam(encodeDealToShareParam(m));
 expect(decoded?.analysis?.lastWorkout).toEqual({purchasePrice:250000,downPaymentPercent:.2});
 m.analysis.lastWorkout!.downPaymentPercent=2;
 expect(normalizeDealInput(m)).toBeNull();
});
it('Undo never applies extra financing or tax fields from persisted metadata',()=>{
 const m=fixture();m.analysis={lastWorkout:{purchasePrice:250000,downPaymentPercent:.2,loanTermYears:1000,propertyTaxAnnualOverride:0} as NonNullable<typeof m.analysis>['lastWorkout']};
 const onChange=vi.fn();render(<DecisionBrief model={m} strategy="longTerm" output={calculateDeal(m).longTerm} onChange={onChange}/>);
 fireEvent.click(screen.getByRole('button',{name:'Undo last workout change'}));
 expect(onChange.mock.calls[0][0].purchase).toEqual({...m.purchase,purchasePrice:250000,downPaymentPercent:.2});
 expect(onChange.mock.calls[0][0].analysis.lastWorkout).toBeUndefined();
});

it('read-only reports show the numerical goal and actual comparison behind a verdict',()=>{
 const m=fixture();m.analysis={minMonthlyCashFlow:900,minDscr:1.25,minCashOnCashPercent:.08};
 render(<DecisionBrief model={m} strategy="longTerm" output={calculateDeal(m).longTerm}/>);
 const goals=screen.getByRole('region',{name:'Goals and actual results'});
 expect(within(goals).getByText('Monthly cash-flow goal').parentElement).toHaveTextContent('$900');
 expect(goals).toHaveTextContent('Actual');expect(goals).toHaveTextContent('1.25');expect(goals).toHaveTextContent('8.0%');
});

it('invalid debt terms show an actionable warning instead of a money headline',()=>{
 const m=fixture();m.purchase.loanTermYears=0;
 render(<DecisionBrief model={m} strategy="longTerm" output={calculateDeal(m).longTerm}/>);
 expect(screen.getByRole('alert')).toHaveTextContent('purchase loan term');
 expect(screen.queryByLabelText('Estimated monthly cash flow')).not.toBeInTheDocument();
});
it('malformed report tokens never silently display a default sample',async()=>{
 const {default:PrintPage}=await import('@/app/print/page');
 render(await PrintPage({searchParams:Promise.resolve({scenario:'invalid-token',strategy:'longTerm'})}));
 expect(screen.getByRole('heading',{name:'Unable to open this report'})).toBeInTheDocument();
 expect(screen.queryByText('Tampa Duplex - Sample Deal')).not.toBeInTheDocument();
});

it('report strategy selection cannot bypass validation of its active refinance loan',async()=>{
 const {default:PrintPage}=await import('@/app/print/page');
 const {createScenarioRecord,encodeScenario}=await import('@/lib/scenario-storage');
 const m=fixture();m.brrrr.arvOverride=300000;m.brrrr.refinanceTermYears=0;
 const token=encodeScenario(createScenarioRecord(m));
 render(await PrintPage({searchParams:Promise.resolve({scenario:token,strategy:'brrrr'})}));
 expect(screen.getByRole('heading',{name:'Unable to open this report'})).toBeInTheDocument();
});

it('full report and backup scenario codecs also whitelist undo metadata',async()=>{
 const {createScenarioRecord,encodeScenario,decodeScenario}=await import('@/lib/scenario-storage');
 const m=fixture();m.analysis={lastWorkout:{purchasePrice:250000,downPaymentPercent:.2,loanTermYears:1000} as NonNullable<typeof m.analysis>['lastWorkout']};
 const decoded=decodeScenario(encodeScenario(createScenarioRecord(m)));
 expect(decoded?.payload.analysis?.lastWorkout).toEqual({purchasePrice:250000,downPaymentPercent:.2});
});
