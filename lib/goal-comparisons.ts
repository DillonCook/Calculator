import type {DealInputModel,StrategyKey,StrategyOutput} from '@/lib/models/deal';
const finite=(value:number|undefined,fallback=0)=>typeof value==='number' && Number.isFinite(value)?Math.max(value,0):fallback;
export function getGoalComparisonRows(model:DealInputModel,strategy:StrategyKey,output:StrategyOutput) {
 const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
 const percent=(n:number)=>`${(n*100).toFixed(1)}%`;
 const row=(label:string,actual:number|null,target:number,format:(n:number)=>string,enabled=true)=>({label,
  value:`Actual: ${actual===null?'Not measurable / not applicable':format(actual)}; Goal: ${enabled?format(target):'Not set'}; ${!enabled?'Disabled':actual===null?'Not assessed':actual>=target?'Meets goal':'Below goal'}`});
 if(strategy==='flip')return [
  row('Flip profit goal',output.calculationBreakdown?.flipMeta?.netProfit ?? 0,finite(model.flip.targetProfit),money,model.flip.targetProfit>0),
  row('Flip total-return goal',output.cashFlowEvents?.some(e=>e.amount<0)?output.roi:null,finite(model.flip.targetRoiPercent),percent,model.flip.targetRoiPercent>0)
 ];
 return [
  row('Monthly cash-flow goal',output.monthlyCashFlow,finite(model.analysis?.minMonthlyCashFlow),money),
  row('Debt-coverage goal (DSCR)',(output.calculationBreakdown?.debtServiceMonthly ?? 0)>0?output.dscr:null,finite(model.analysis?.minDscr,1),n=>n.toFixed(2)),
  row('Cash-on-cash goal',output.totalCashNeeded>0?output.cashOnCashReturn:null,finite(model.analysis?.minCashOnCashPercent),percent)
 ];
}
