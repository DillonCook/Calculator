import { calculateLoanAmount } from '@/lib/engine/finance';
import { calculateRemainingBalance, calculateRemainingBalanceWithPayment } from '@/lib/engine/investment-math';
import type { DealInputModel, StrategyOutput } from '@/lib/models/deal';

export interface ProjectionMetrics {
  totalInvested: number;
  holdMonths: number;
  cumulativeOperatingCashFlow: number;
  exitCashReturned: number;
  modeledTotalReturn: number;
  modeledProfit: number;
  modeledMultiple: number;
  paybackMonths: number | null;
  exitLabel: string;
}

const clampPercent = (value: number) => Math.min(Math.max(value, 0), 1);
const clampGrowthRate = (value: number) => Math.min(Math.max(value, -0.95), 1);
const POSITIVE_EPSILON = 1e-6;

export const annualizeCashFlowTotal = (totalCashFlow: number, holdYears: number): number => {
  const normalizedHoldYears = Math.max(Number.isFinite(holdYears) ? holdYears : 0, 0);
  return normalizedHoldYears > 0 ? totalCashFlow / normalizedHoldYears : 0;
};

export const getTotalCashInvested = (output: StrategyOutput): number => {
  const cashFlows = output.cashFlowEvents?.map((event) => event.amount) ?? output.cashFlowTimeline ?? [];
  return cashFlows.some((flow) => flow < 0)
    ? cashFlows.reduce((sum, flow) => sum + (flow < 0 ? -flow : 0), 0)
    : Math.max(output.totalCashNeeded, 0);
};

export const getAnnualOperatingCashFlows = (output: StrategyOutput, holdYears: number): number[] => {
  if (output.cashFlowEvents?.length) {
    const holdMonths = output.strategy === 'flip'
      ? Math.max(output.calculationBreakdown?.flipMeta?.holdingMonths ?? 0, 0)
      : Math.max(holdYears * 12, 0);
    const buckets = Array.from({ length: Math.max(Math.ceil(holdMonths / 12), 1) }, () => 0);
    for (const event of output.cashFlowEvents) {
      if (event.category !== 'operating') continue;
      const index = Math.min(Math.max(Math.floor((Math.max(event.month, 1e-9) - 1e-9) / 12), 0), buckets.length - 1);
      buckets[index] += event.amount;
    }
    return buckets;
  }
  const flows = output.cashFlowTimeline.slice(1);
  if (flows.length > 0 && output.saleProceeds) flows[flows.length - 1] -= output.saleProceeds;
  return flows;
};

export const getProjectionMetrics = (
  output: StrategyOutput,
  holdYears: number,
  input?: DealInputModel
): ProjectionMetrics => {
  const holdMonths = resolveHoldMonths(output, holdYears);
  const exitCashReturned = resolveExitCashReturned(output);
  const monthlyOperatingCashFlow = buildMonthlyOperatingCashFlow(output, holdMonths);
  const timeline = output.cashFlowTimeline ?? [];
  const eventAmounts = output.cashFlowEvents?.map((event) => event.amount) ?? [];
  const cashFlows = eventAmounts.length > 0 ? eventAmounts : timeline;
  const initialCashInvested = output.cashFlowEvents?.length
    ? output.cashFlowEvents.reduce((sum, event) => sum + (event.month <= 0 && event.amount < 0 ? -event.amount : 0), 0)
    : timeline.length > 0
      ? Math.max(-(timeline[0] ?? 0), 0)
      : Math.max(output.totalCashNeeded, 0);
  const totalInvested = getTotalCashInvested(output);
  const cumulativeOperatingCashFlow = output.cashFlowEvents?.length
    ? output.cashFlowEvents.reduce((sum, event) => sum + (event.category === 'operating' ? event.amount : 0), 0)
    : monthlyOperatingCashFlow.reduce((sum, value) => sum + value, 0);
  const modeledProfit = cashFlows.length > 0 ? cashFlows.reduce((sum, flow) => sum + flow, 0) : output.roi * totalInvested;
  const modeledTotalReturn = totalInvested + modeledProfit;
  const modeledMultiple = totalInvested > 0 ? modeledTotalReturn / totalInvested : 0;
  const paybackMonths = calculatePaybackMonths({
    output,
    input,
    holdMonths,
    totalInvested: initialCashInvested,
    exitCashReturned,
    monthlyOperatingCashFlow
  });

  return {
    totalInvested,
    holdMonths,
    cumulativeOperatingCashFlow,
    exitCashReturned,
    modeledTotalReturn,
    modeledProfit,
    modeledMultiple,
    paybackMonths,
    exitLabel: output.strategy === 'flip' ? 'Projected sale cash returned' : 'Projected sale proceeds'
  };
};

const resolveHoldMonths = (output: StrategyOutput, holdYears: number) => {
  if (output.strategy === 'flip') {
    return Math.max(output.calculationBreakdown?.flipMeta?.holdingMonths ?? 0, 0);
  }

  return Math.max(Math.round(holdYears * 12), 0);
};

const resolveExitCashReturned = (output: StrategyOutput) => {
  if (output.strategy === 'flip') {
    const saleEvents = output.cashFlowEvents?.filter((event) => event.category === 'sale') ?? [];
    return saleEvents.length > 0 ? saleEvents.reduce((sum, event) => sum + event.amount, 0) : output.cashFlowTimeline.at(-1) ?? 0;
  }

  return output.saleProceeds ?? 0;
};

const buildMonthlyOperatingCashFlow = (output: StrategyOutput, holdMonths: number) => {
  if (holdMonths <= 0) return [];
  const monthBucketCount = Math.ceil(holdMonths);
  if (output.cashFlowEvents?.length) {
    const monthlyFlows = Array.from({ length: monthBucketCount }, () => 0);
    output.cashFlowEvents.forEach((event) => {
      if (event.category !== 'operating' || event.month <= 0 || event.month > holdMonths) return;
      const index = Math.min(Math.max(Math.ceil(event.month) - 1, 0), monthBucketCount - 1);
      monthlyFlows[index] += event.amount;
    });
    return monthlyFlows;
  }
  if (output.strategy === 'flip') return Array.from({ length: monthBucketCount }, () => 0);

  const periods = output.cashFlowTimeline.slice(1);
  if (periods.length === 0) return Array.from({ length: monthBucketCount }, () => 0);

  const fullYears = Math.floor(holdMonths / 12);
  const partialMonths = holdMonths - fullYears * 12;
  const operatingPeriods = periods.map((value, index) => (index === periods.length - 1 ? value - (output.saleProceeds ?? 0) : value));
  const monthlyFlows: number[] = [];

  operatingPeriods.forEach((periodValue, index) => {
    const monthsInPeriod =
      partialMonths > 0 && index === operatingPeriods.length - 1
        ? partialMonths
        : index < fullYears
          ? 12
          : Math.max(holdMonths - monthlyFlows.length, 0);

    if (monthsInPeriod <= 0) return;

    const monthlyValue = periodValue / monthsInPeriod;
    const monthBucketsInPeriod = Math.ceil(monthsInPeriod);
    for (let month = 0; month < monthBucketsInPeriod; month += 1) {
      monthlyFlows.push(monthlyValue * Math.min(1, monthsInPeriod - month));
    }
  });

  while (monthlyFlows.length < monthBucketCount) {
    monthlyFlows.push(0);
  }

  return monthlyFlows.slice(0, monthBucketCount);
};

const calculatePaybackMonths = ({
  output,
  input,
  holdMonths,
  totalInvested,
  exitCashReturned,
  monthlyOperatingCashFlow
}: {
  output: StrategyOutput;
  input?: DealInputModel;
  holdMonths: number;
  totalInvested: number;
  exitCashReturned: number;
  monthlyOperatingCashFlow: number[];
}) => {
  const wholeMonths = Math.floor(holdMonths);
  const evaluationMonths = Array.from({ length: wholeMonths }, (_, index) => index + 1);
  if (holdMonths - wholeMonths > POSITIVE_EPSILON) evaluationMonths.push(holdMonths);
  if (evaluationMonths.length === 0) evaluationMonths.push(0);

  if (output.cashFlowEvents?.length) {
    for (const month of evaluationMonths) {
      const cumulativeNonSaleCashFlow = output.cashFlowEvents.reduce(
        (sum, event) => sum + (event.category !== 'sale' && event.month <= month + POSITIVE_EPSILON ? event.amount : 0),
        0
      );
      const saleCashAtMonth = input ? getModeledSaleCashAtMonth(output, input, month) : month === holdMonths ? exitCashReturned : 0;
      if (cumulativeNonSaleCashFlow + saleCashAtMonth + POSITIVE_EPSILON >= 0) return month;
    }
    return null;
  }

  if (totalInvested <= POSITIVE_EPSILON) return 0;

  let cumulativeOperatingCashFlow = 0;
  let previousBucketIndex = -1;

  for (const month of evaluationMonths) {
    const bucketIndex = Math.max(Math.ceil(month) - 1, 0);
    if (bucketIndex !== previousBucketIndex) {
      cumulativeOperatingCashFlow += monthlyOperatingCashFlow[bucketIndex] ?? 0;
      previousBucketIndex = bucketIndex;
    }
    const saleCashAtMonth = input ? getModeledSaleCashAtMonth(output, input, month) : month === holdMonths ? exitCashReturned : 0;

    if (cumulativeOperatingCashFlow + saleCashAtMonth + POSITIVE_EPSILON >= totalInvested) {
      return month;
    }
  }

  return null;
};

export const getModeledSaleCashAtMonth = (output: StrategyOutput, input: DealInputModel, month: number) => {
  if (output.strategy === 'flip') {
    const holdingMonths = Math.max(output.calculationBreakdown?.flipMeta?.holdingMonths ?? 0, 0);
    return month >= holdingMonths ? resolveExitCashReturned(output) : 0;
  }

  const salePrice = getModeledSalePriceAtMonth(output, input, month);
  const sellingCosts = salePrice * clampPercent(input.assumptions.sellingCostPercent);
  const remainingDebt = getRemainingDebtAtMonth(output, input, month);

  return salePrice - sellingCosts - remainingDebt;
};

const getModeledSalePriceAtMonth = (output: StrategyOutput, input: DealInputModel, month: number) => {
  const strategy = output.strategy;
  const acquisitionBasisPrice = input.purchase.ownershipMode === 'owned' ? input.purchase.ownedPurchasePrice : input.purchase.purchasePrice;
  const turnaroundPending = strategy === 'longTerm' && output.longTermTurnaroundSummary?.enabled && month < 12 - 1e-9;
  const baseValue = turnaroundPending ? acquisitionBasisPrice : resolveBaseValue(output, input);
  const appreciationRate = clampGrowthRate(input.assumptions.annualAppreciationPercent);

  const appreciationDelayYears =
    strategy === 'brrrr'
      ? Math.max(input.brrrr.holdingMonths, 0) / 12
      : strategy === 'longTerm' && input.longTerm.turnaround.enabled
        ? 1
        : 0;
  const appreciationYears = Math.max(month / 12 - appreciationDelayYears, 0);
  return Math.max(baseValue, 0) * Math.pow(1 + appreciationRate, appreciationYears);
};

const resolveBaseValue = (output: StrategyOutput, input: DealInputModel) => {
  const strategy = output.strategy;
  const acquisitionBasisPrice =
    input.purchase.ownershipMode === 'owned' ? Math.max(input.purchase.ownedPurchasePrice, 0) : Math.max(input.purchase.purchasePrice, 0);
  const purchaseBaseValue = input.purchase.arv > 0 ? input.purchase.arv : acquisitionBasisPrice;

  if (strategy === 'longTerm' && output.longTermTurnaroundSummary?.enabled) {
    return Math.max(output.longTermTurnaroundSummary.modeledExitValue, 0);
  }

  if (strategy === 'longTerm') {
    if (input.longTerm.turnaround.enabled && input.longTerm.turnaround.stabilizedArvOverride && input.longTerm.turnaround.stabilizedArvOverride > 0) {
      return input.longTerm.turnaround.stabilizedArvOverride;
    }

    return input.longTerm.arvOverride && input.longTerm.arvOverride > 0 ? input.longTerm.arvOverride : purchaseBaseValue;
  }
  if (strategy === 'airbnb') return input.airbnb.arvOverride && input.airbnb.arvOverride > 0 ? input.airbnb.arvOverride : purchaseBaseValue;
  if (strategy === 'padSplit') return input.padSplit.arvOverride && input.padSplit.arvOverride > 0 ? input.padSplit.arvOverride : purchaseBaseValue;
  if (strategy === 'brrrr') {
    if (input.brrrr.arvOverride && input.brrrr.arvOverride > 0) return input.brrrr.arvOverride;
    return Math.max(input.purchase.arv, 0);
  }
  if (strategy === 'flip') return input.flip.arvOverride && input.flip.arvOverride > 0 ? input.flip.arvOverride : purchaseBaseValue;

  return purchaseBaseValue;
};

const getAcquisitionRemainingDebtAtMonth = (input: DealInputModel, month: number) => {
  const { purchase } = input;
  const elapsedYears = Math.max(month, 0) / 12;
  let primaryBalance = 0;

  if (purchase.ownershipMode === 'owned' && purchase.existingMortgageBalance > 0) {
    primaryBalance = calculateRemainingBalanceWithPayment(
      purchase.existingMortgageBalance,
      purchase.existingMortgageRate,
      purchase.existingMortgageMonthly,
      purchase.existingMortgageRemainingYears,
      elapsedYears
    );
  } else if (purchase.ownershipMode !== 'owned' && purchase.financingType === 'loan') {
    const initialLoanAmount = calculateLoanAmount(purchase.purchasePrice, purchase.downPaymentPercent);
    primaryBalance = calculateRemainingBalance(
      initialLoanAmount,
      purchase.interestRate,
      purchase.loanTermYears,
      elapsedYears,
      purchase.amortizationType
    );
  }

  const helocBalance = calculateRemainingBalance(
    purchase.helocAmount,
    purchase.helocRate,
    purchase.helocTermYears,
    elapsedYears,
    purchase.helocAmortizationType
  );

  return primaryBalance + helocBalance;
};

const getRemainingDebtAtMonth = (output: StrategyOutput, input: DealInputModel, month: number) => {
  if (output.strategy === 'brrrr') return getBrrrrRemainingDebtAtMonth(output, input, month);
  return getAcquisitionRemainingDebtAtMonth(input, month);
};

const getBrrrrRemainingDebtAtMonth = (output: StrategyOutput, input: DealInputModel, month: number) => {
  const refinancePrincipal = Math.max(output.calculationBreakdown?.brrrrMeta?.refiLoanAmount ?? 0, 0);
  const refinanceMonth = Math.max(output.calculationBreakdown?.brrrrMeta?.holdingMonths ?? input.brrrr.holdingMonths, 0);
  if (month < refinanceMonth - 1e-9) {
    return getAcquisitionRemainingDebtAtMonth(input, month);
  }
  if (refinancePrincipal <= 0) return 0;

  return calculateRemainingBalance(
    refinancePrincipal,
    input.brrrr.refinanceRate,
    input.brrrr.refinanceTermYears ?? 30,
    Math.max(month - refinanceMonth, 0) / 12,
    'PI'
  );
};
