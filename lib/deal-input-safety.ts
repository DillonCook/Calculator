import {readWorkoutSnapshot} from '@/lib/workout-snapshot';
import {getDebtTermIssues} from '@/lib/debt-terms';
import {defaultDealInput} from '@/lib/models/deal';
const record=(value:unknown):value is Record<string,unknown>=>!!value && typeof value==='object' && !Array.isArray(value);
function compatible(template:unknown,value:unknown,key=''):boolean {
  if(value===undefined)return true; // Older partial payloads legitimately omit defaults.
  if(template===null)return value===null || (typeof value==='number' && Number.isFinite(value) && Math.abs(value)<=1e12);
  if(typeof template==='number') {
    if(typeof value!=='number' || !Number.isFinite(value) || Math.abs(value)>1e12)return false;
    if((key==='holdYears' || key.endsWith('TermYears')) && (value<0 || value>100))return false;
    if(key==='holdingMonths' && (value<0 || value>1200))return false;
    if(key.endsWith('Percent') && Math.abs(value)>10)return false;
    if(key.endsWith('Rate') && (value<0 || value>1))return false;
    return true;
  }
  if(typeof template==='string') {
    if(typeof value!=='string' || value.length>4000)return false;
    const choices:Record<string,string[]>={financingType:['cash','loan','heloc'],ownershipMode:['purchase','owned'],amortizationType:['PI','IO'],helocAmortizationType:['PI','IO'],operatingStrategy:['longTerm','airbnb','padSplit']};
    return !choices[key] || choices[key].includes(value);
  }
  if(typeof template==='boolean')return typeof value==='boolean';
  if(Array.isArray(template))return Array.isArray(value) && value.length<=200 && value.every(v=>compatible(template[0],v));
  if(record(template))return record(value) && Object.keys(template).every(k=>compatible(template[k],value[k],k));
  return true;
}
/** Reject explicitly malformed public/imported inputs; do not silently replace a bad number with a guessed default. */
export function isSafePartialDealInput(value:unknown):boolean {
  if(!record(value) || !compatible(defaultDealInput,value))return false;
  const model={...defaultDealInput,
    purchase:{...defaultDealInput.purchase,...(record(value.purchase)?value.purchase:{})},
    brrrr:{...defaultDealInput.brrrr,...(record(value.brrrr)?value.brrrr:{})},
    assumptions:{...defaultDealInput.assumptions,...(record(value.assumptions)?value.assumptions:{})}};
  if(getDebtTermIssues(model,record(value.uiState) && value.uiState.activeStrategy==='brrrr'?'brrrr':undefined).length)return false;
  if(value.analysis!==undefined) {
    if(!record(value.analysis))return false;
    const a=value.analysis;
    if(a.kind!==undefined && a.kind!=='sample' && a.kind!=='property')return false;
    if(a.assumptionsReviewed!==undefined && typeof a.assumptionsReviewed!=='boolean')return false;
    for(const key of ['minMonthlyCashFlow','minDscr','minCashOnCashPercent'])if(a[key]!==undefined && (typeof a[key]!=='number' || !Number.isFinite(a[key]) || Math.abs(a[key] as number)>1e12))return false;
    if(a.lastWorkout!==undefined && !readWorkoutSnapshot(a.lastWorkout))return false;
  }
  return true;
}
