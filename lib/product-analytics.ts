import type {DealInputModel,StrategyKey} from '@/lib/models/deal';
import {getDealReadiness} from '@/lib/deal-readiness';
import {trackAnalyticsEvent} from '@/lib/analytics';

export type ProductEvent = 'first_valid_analysis'|'meaningful_save'|'second_valid_deal'|'meaningful_return_visit'|'assumptions_reviewed'|'downside_compared'|'workout_adjustment_applied'|'meaningful_share';
const key='dealcooker.product-milestones:v1';
const allowedQueryKeys=new Set(['strategy','source','utm_source','utm_medium','utm_campaign','utm_content','utm_term']);
export function isMeasurementUrl(value:string) {
  try {const url=new URL(value);return url.protocol==='https:' && url.hostname==='www.dealcooker.app' && url.pathname==='/' && !url.hash && [...url.searchParams.keys()].every(k=>allowedQueryKeys.has(k));} catch{return false;}
}
const pageMeasurementAllowed=typeof window!=='undefined' && isMeasurementUrl(window.location.href);
export function isMeaningfulProperty(model:DealInputModel,strategy:StrategyKey) {
  return model.analysis?.kind!=='sample' && !model.purchase.dealName.includes('Sample Deal') && getDealReadiness(model,strategy).ready;
}
export const productEventProperties=(strategy:StrategyKey)=>({strategy});
export function trackProductEvent(event:ProductEvent,model:DealInputModel,strategy:StrategyKey) {
  if(!pageMeasurementAllowed || typeof window==='undefined' || !isMeasurementUrl(window.location.href) || !isMeaningfulProperty(model,strategy))return;
  void trackAnalyticsEvent(event,productEventProperties(strategy));
}
/** Device-local milestone bookkeeping. Deal IDs never leave this browser. */
export function recordValidProperty(model:DealInputModel,strategy:StrategyKey,dealId:string,saved:boolean) {
  if(!pageMeasurementAllowed || typeof window==='undefined' || !dealId || !isMeasurementUrl(window.location.href) || !isMeaningfulProperty(model,strategy))return;
  try {
    const parsed=JSON.parse(window.localStorage.getItem(key)??'{}');
    const valid:string[]=Array.isArray(parsed.valid)?parsed.valid.filter((x:unknown)=>typeof x==='string').slice(-100):[];
    const savedIds:string[]=Array.isArray(parsed.saved)?parsed.saved.filter((x:unknown)=>typeof x==='string').slice(-100):[];
    if(!valid.includes(dealId)){
      if(!valid.length)trackProductEvent('first_valid_analysis',model,strategy);
      if(valid.length===1)trackProductEvent('second_valid_deal',model,strategy);
      valid.push(dealId);
    }
    if(saved && !savedIds.includes(dealId)){savedIds.push(dealId);trackProductEvent('meaningful_save',model,strategy);}
    if(typeof parsed.lastSeen==='number' && Date.now()-parsed.lastSeen>24*60*60*1000)trackProductEvent('meaningful_return_visit',model,strategy);
    window.localStorage.setItem(key,JSON.stringify({valid:valid.slice(-100),saved:savedIds.slice(-100),lastSeen:Date.now()}));
  } catch { /* Storage restrictions never interrupt an analysis. */ }
}
