import type {DealInputModel, StrategyKey} from '@/lib/models/deal';
/** Terms support one month through 100 years, including fractional years. */
export const isSupportedDebtTerm = (years: number) => Number.isFinite(years) && years >= 1/12 && years <= 100;
// Defensive calculation fallback only. Readiness/import boundaries must flag it.
export const modeledDebtTerm = (years: number) => isSupportedDebtTerm(years) ? years : 1;
export function getDebtTermIssues(model: DealInputModel, strategy?: StrategyKey): string[] {
  const p=model.purchase, issues:string[]=[];
  const check=(active:boolean, years:number, label:string)=>{if(active && !isSupportedDebtTerm(years))issues.push(`${label} (1 month–100 years)`);};
  check(p.ownershipMode!=='owned' && p.financingType==='loan' && p.purchasePrice>0 && p.downPaymentPercent<1,p.loanTermYears,'purchase loan term');
  check(p.helocAmount>0,p.helocTermYears,'HELOC term');
  check(p.ownershipMode==='owned' && (p.existingMortgageBalance>0 || p.existingMortgageMonthly>0),p.existingMortgageRemainingYears,'remaining mortgage term');
  check(strategy==='brrrr' && model.brrrr.refinanceLtvPercent>0 && (model.brrrr.arvOverride ?? 0)>0 && model.brrrr.holdingMonths<=model.assumptions.holdYears*12,model.brrrr.refinanceTermYears,'refinance loan term');
  return issues;
}
