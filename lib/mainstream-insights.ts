import type { DealInputModel, StrategyKey, StrategyOutput } from '@/lib/models/deal';
import { calculateStrategy } from '@/lib/engine/deal-engine';
import { getDealReadiness } from '@/lib/deal-readiness';
import { getModeledSalePriceAtMonth, getRemainingDebtAtMonth } from '@/lib/projection-metrics';
import { calculateLoanAmount } from '@/lib/engine/finance';
import { getFixedCostBreakdown } from '@/lib/tax-insurance';

export interface MoneyRow { label: string; amount: number; }
export function getMoneyWaterfall(output: StrategyOutput): MoneyRow[] {
  const breakdown = output.calculationBreakdown;
  const income = breakdown?.revenueMonthly ?? 0;
  const debt = breakdown?.debtServiceMonthly ?? 0;
  const vacancyKey = output.strategy === 'longTerm' ? output.longTermTurnaroundSummary?.enabled ? 'lt-stab-vacancy' : 'lt-vacancy' : 'comm-vacancy';
  const vacancy = Math.max(-(breakdown?.lines.find(line => line.key === vacancyKey)?.monthly ?? 0), 0);
  const otherCosts = income - vacancy - debt - output.monthlyCashFlow;
  return [
    { label: output.strategy === 'brrrr' ? 'Operating income after expenses' : 'Modeled gross income', amount: income },
    { label: 'Vacancy reserve', amount: -vacancy },
    { label: 'Operating costs and reserves', amount: -otherCosts },
    { label: 'Debt payments', amount: debt === 0 ? 0 : -debt },
    { label: 'Money left each month', amount: output.monthlyCashFlow }
  ];
}


export function getCapitalTiming(output: StrategyOutput) {
  const events = output.cashFlowEvents ?? [];
  return {
    upfront: events.filter(e => e.month === 0 && e.amount < 0).reduce((s,e) => s-e.amount,0),
    excessFunding: events.filter(e => e.month === 0 && e.category === 'capital' && e.amount > 0).reduce((s,e) => s+e.amount,0),
    futureContributions: events.filter(e => e.month > 0 && e.amount < 0 && e.category !== 'sale').reduce((s,e) => s-e.amount,0),
    refinanceCash: events.filter(e => e.category === 'refinance').reduce((s,e) => s+e.amount,0),
    saleShortfall: events.filter(e=>e.category==='sale' && e.amount<0).reduce((s,e)=>s-e.amount,0),
    cashLeftAfterRefinance: output.strategy === 'brrrr' ? output.totalCashNeeded : null
  };
}



const nonnegative = (value: number | undefined, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? Math.max(value,0) : fallback;
export function getDecisionVerdict(model: DealInputModel, strategy: StrategyKey, output: StrategyOutput) {
  if (!getDealReadiness(model,strategy).ready) return { status: 'incomplete', label: 'More information needed' };
  if (strategy === 'flip') {
    const meta = output.calculationBreakdown?.flipMeta;
    if (!meta || meta.netProfit < 0) return { status: 'negative', label: 'Modeled loss at this price' };
    if (meta.netProfit < model.flip.targetProfit || output.roi < model.flip.targetRoiPercent) return { status: 'misses', label: 'Below your flip targets' };
    return { status: 'meets', label: 'Meets your flip targets with these assumptions' };
  }
  if (output.monthlyCashFlow < 0) return { status: 'negative', label: 'You would cover a monthly shortfall' };
  const hasDebt = (output.calculationBreakdown?.debtServiceMonthly ?? 0) > 0;
  if (output.monthlyCashFlow < nonnegative(model.analysis?.minMonthlyCashFlow) ||
      output.cashOnCashReturn < nonnegative(model.analysis?.minCashOnCashPercent) ||
      (hasDebt && output.dscr < nonnegative(model.analysis?.minDscr,1))) {
    return { status: 'misses', label: 'Positive cash flow, below your targets' };
  }
  if (output.monthlyCashFlow < Math.max(100,(output.calculationBreakdown?.revenueMonthly ?? 0)*0.1) || (hasDebt && output.dscr < 1.2)) {
    return { status: 'thin', label: 'Positive, but a thin cushion' };
  }
  return { status: 'meets', label: 'Positive cash flow with these assumptions' };
}



export interface SensitivityChanges { incomePercent: number; costPercent: number; exitPercent: number; }
export function applySensitivity(input: DealInputModel, strategy: StrategyKey, changes: SensitivityChanges) {
  const model = structuredClone(input);
  const factor = (value: number) => 1 + Math.min(Math.max(Number.isFinite(value) ? value : 0,-90),100)/100;
  const income = factor(changes.incomePercent), cost = factor(changes.costPercent), exit = factor(changes.exitPercent);
  const operating = strategy === 'brrrr' ? model.brrrr.operatingStrategy : strategy;
  if (operating === 'longTerm') {
    model.longTerm.grossRentMonthly *= income;
    model.longTerm.otherIncomeMonthly *= income;
    if (model.longTerm.annualRevenueOverride !== null) model.longTerm.annualRevenueOverride *= income;
    model.longTerm.ownerExpensesMonthly *= cost;
    model.longTerm.turnaround.stabilizedGrossRentMonthly *= income;
    model.longTerm.turnaround.stabilizedOtherIncomeMonthly *= income;
    model.longTerm.turnaround.ownerPaidExpensesMonthly *= cost;
    model.longTerm.turnaround.annualTaxInsuranceAdjustment *= cost;
    model.longTerm.turnaround.laundryIncomeMonthly *= income;
    model.longTerm.turnaround.vendingMiscIncomeMonthly *= income;
    model.longTerm.turnaround.garageIncomeMonthly *= income;
    model.longTerm.turnaround.parkingIncomeMonthly *= income;
    model.longTerm.turnaround.additionalIncomeMonthly *= income;
    // Exit assumptions are resolved after income/cost changes, including implied values.
  } else if (operating === 'airbnb') {
    model.airbnb.adr *= income;
    model.airbnb.cleaningFeeCharged *= income;
    if (model.airbnb.annualRevenueOverride !== null) model.airbnb.annualRevenueOverride *= income;
    model.airbnb.ownerExpensesMonthly *= cost;
    model.airbnb.cleanerCostPerTurn *= cost;
  } else if (operating === 'padSplit') {
    model.padSplit.ownerExpensesMonthly *= cost;
    model.padSplit.propertyManagementFeeMonthly *= cost;
    model.padSplit.turnoverCostPerMoveOut *= cost;
    model.padSplit.avgWeeklyRatePerRoom *= income;
    model.padSplit.otherIncomeMonthly *= income;
    if (model.padSplit.annualRevenueOverride !== null) model.padSplit.annualRevenueOverride *= income;
  } else if (operating === 'purchase') {
    model.commercial.averageBaseRentPerSqftYear *= income;
    model.commercial.nnnRecoveryPerSqftYear *= income;
    model.commercial.tenantImprovementsReservePerSqftYear *= cost;
    model.commercial.leasingCommissionsReservePerSqftYear *= cost;
    model.commercial.nonRecoverableExpensesPerSqftYear *= cost;
  }
  if (strategy === 'flip') model.flip.rehabOverride = (model.flip.rehabOverride ?? model.purchase.rehabBudget)*cost;
  model.variableExpenses = model.variableExpenses.map(e => ({...e,monthlyAmount:e.monthlyAmount*cost}));
  const fixed=getFixedCostBreakdown(input.purchase);
  if(model.purchase.ownershipMode==='owned') {
    model.purchase.existingTaxMonthly*=cost;
    model.purchase.existingInsuranceMonthly*=cost;
  } else {
    model.purchase.propertyTaxAnnualOverride=fixed.propertyTaxAnnual*cost;
    model.purchase.insuranceAnnualOverride=fixed.insuranceAnnual*cost;
  }
  model.purchase.hoaMonthly *= cost;
  model.purchase.pmiMonthly *= cost;
  if (strategy==='brrrr') model.brrrr.holdingExpensesMonthly *= cost;
  const reference=calculateStrategy(model,strategy);
  const baseValue=getModeledSalePriceAtMonth(reference,model,0);
  const missingRequiredValue=(strategy==='brrrr' && !((model.brrrr.arvOverride ?? model.purchase.arv)>0)) || (strategy==='flip' && !((model.flip.arvOverride ?? model.purchase.arv)>0));
  if(baseValue>0 && !missingRequiredValue) {
    if(strategy==='longTerm' && model.longTerm.turnaround.enabled) {
      const month=12; // The turnaround engine models one current-income year before stabilization.
      model.longTerm.turnaround.stabilizedArvOverride=getModeledSalePriceAtMonth(reference,model,month)*exit;
    }
    model.purchase.arv=baseValue*exit;
    if(strategy!=='purchase')model[strategy].arvOverride=baseValue*exit;
  }
  const preStabilizationValue = strategy==='longTerm' && model.longTerm.turnaround.enabled ? baseValue*exit : undefined;
  return { model, output: calculateStrategy(model,strategy,true,preStabilizationValue) };
}



export function getReturnDrivers(model: DealInputModel, output: StrategyOutput): MoneyRow[] {
  const events = output.cashFlowEvents ?? [];
  const operating = events.filter(e=>e.category==='operating').reduce((s,e)=>s+e.amount,0);
  const profit = events.reduce((s,e)=>s+e.amount,0);
  const months = model.assumptions.holdYears*12;
  const p = model.purchase;
  const initialDebt = (p.ownershipMode==='owned' ? p.existingMortgageBalance : p.financingType==='loan' ? calculateLoanAmount(p.purchasePrice,p.downPaymentPercent) : 0) + Math.max(p.helocAmount,0);
  const meta = output.calculationBreakdown?.brrrrMeta;
  const refiWithinHold = meta && meta.holdingMonths <= months;
  const principalPaid = output.strategy === 'flip' ? 0 : Math.max(initialDebt + (refiWithinHold ? meta.refiLoanAmount-meta.initialLoanPayoff : 0) - getRemainingDebtAtMonth(output,model,months),0);
  const appreciation = output.strategy === 'flip' ? 0 : getModeledSalePriceAtMonth(output,model,months) - getModeledSalePriceAtMonth(output,model,0);
  return [
    {label:'Operating cash after debt payments',amount:operating},
    {label:'Principal repaid — equity, not income',amount:principalPaid},
    {label:'Modeled value change — not cash until sale',amount:appreciation},
    {label:'Other project costs and value changes',amount:profit-operating-principalPaid-appreciation}
  ];
}
