import { calculateLoanAmount } from '@/lib/engine/finance';
import { calculateRemainingBalance } from '@/lib/engine/investment-math';
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

export const getProjectionMetrics = (
  output: StrategyOutput,
  holdYears: number,
  input?: DealInputModel
): ProjectionMetrics => {
  const totalInvested = Math.max(output.totalCashNeeded, 0);
  const holdMonths = resolveHoldMonths(output, holdYears);
  const exitCashReturned = resolveExitCashReturned(output);
  const monthlyOperatingCashFlow = buildMonthlyOperatingCashFlow(output, holdMonths);
  const cumulativeOperatingCashFlow = monthlyOperatingCashFlow.reduce((sum, value) => sum + value, 0);
  const modeledTotalReturn = cumulativeOperatingCashFlow + exitCashReturned;
  const modeledProfit = modeledTotalReturn - totalInvested;
  const modeledMultiple = totalInvested > 0 ? modeledTotalReturn / totalInvested : 0;
  const paybackMonths = calculatePaybackMonths({
    output,
    input,
    holdMonths,
    totalInvested,
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
    exitLabel: 'Projected sale proceeds'
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
    return output.cashFlowTimeline.at(-1) ?? 0;
  }

  return output.saleProceeds ?? 0;
};

const buildMonthlyOperatingCashFlow = (output: StrategyOutput, holdMonths: number) => {
  if (holdMonths <= 0) return [];
  if (output.strategy === 'flip') return Array.from({ length: holdMonths }, () => 0);

  const periods = output.cashFlowTimeline.slice(1);
  if (periods.length === 0) return Array.from({ length: holdMonths }, () => 0);

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
    for (let month = 0; month < monthsInPeriod; month += 1) {
      monthlyFlows.push(monthlyValue);
    }
  });

  while (monthlyFlows.length < holdMonths) {
    monthlyFlows.push(0);
  }

  return monthlyFlows.slice(0, holdMonths);
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
  if (totalInvested <= POSITIVE_EPSILON) return 0;
  if (holdMonths <= 0) return exitCashReturned + POSITIVE_EPSILON >= totalInvested ? 0 : null;

  let cumulativeOperatingCashFlow = 0;

  for (let month = 1; month <= holdMonths; month += 1) {
    cumulativeOperatingCashFlow += monthlyOperatingCashFlow[month - 1] ?? 0;
    const saleCashAtMonth = input ? getModeledSaleCashAtMonth(output, input, month) : month === holdMonths ? exitCashReturned : 0;

    if (cumulativeOperatingCashFlow + saleCashAtMonth + POSITIVE_EPSILON >= totalInvested) {
      return month;
    }
  }

  return null;
};

const getModeledSaleCashAtMonth = (output: StrategyOutput, input: DealInputModel, month: number) => {
  if (output.strategy === 'flip') {
    const holdingMonths = Math.max(output.calculationBreakdown?.flipMeta?.holdingMonths ?? 0, 0);
    return month >= holdingMonths ? resolveExitCashReturned(output) : 0;
  }

  const salePrice = getModeledSalePriceAtMonth(output.strategy, input, month);
  const sellingCosts = salePrice * clampPercent(input.assumptions.sellingCostPercent);
  const remainingDebt = getRemainingDebtAtMonth(output, input, month);

  return salePrice - sellingCosts - remainingDebt;
};

const getModeledSalePriceAtMonth = (strategy: StrategyOutput['strategy'], input: DealInputModel, month: number) => {
  const baseValue = resolveBaseValue(strategy, input);
  const appreciationRate = clampGrowthRate(input.assumptions.annualAppreciationPercent);

  return baseValue * Math.pow(1 + appreciationRate, month / 12);
};

const resolveBaseValue = (strategy: StrategyOutput['strategy'], input: DealInputModel) => {
  const acquisitionBasisPrice =
    input.purchase.ownershipMode === 'owned' ? Math.max(input.purchase.ownedPurchasePrice, 0) : Math.max(input.purchase.purchasePrice, 0);
  const purchaseBaseValue = input.purchase.arv > 0 ? input.purchase.arv : acquisitionBasisPrice;

  if (strategy === 'longTerm') return input.longTerm.arvOverride && input.longTerm.arvOverride > 0 ? input.longTerm.arvOverride : purchaseBaseValue;
  if (strategy === 'airbnb') return input.airbnb.arvOverride && input.airbnb.arvOverride > 0 ? input.airbnb.arvOverride : purchaseBaseValue;
  if (strategy === 'padSplit') return input.padSplit.arvOverride && input.padSplit.arvOverride > 0 ? input.padSplit.arvOverride : purchaseBaseValue;
  if (strategy === 'brrrr') return input.brrrr.arvOverride && input.brrrr.arvOverride > 0 ? input.brrrr.arvOverride : purchaseBaseValue;
  if (strategy === 'flip') return input.flip.arvOverride && input.flip.arvOverride > 0 ? input.flip.arvOverride : purchaseBaseValue;

  return purchaseBaseValue;
};

const getRemainingDebtAtMonth = (output: StrategyOutput, input: DealInputModel, month: number) => {
  if (output.strategy === 'brrrr') {
    return getBrrrrRemainingDebtAtMonth(output, input, month);
  }

  const { purchase } = input;
  const elapsedYears = month / 12;
  let primaryBalance = 0;

  if (purchase.ownershipMode === 'owned') {
    if (purchase.existingMortgageBalance > 0) {
      primaryBalance = calculateRemainingBalance(
        purchase.existingMortgageBalance,
        Math.max(purchase.existingMortgageRate, 0),
        Math.max(purchase.existingMortgageRemainingYears, 1),
        elapsedYears,
        'PI'
      );
    }
  } else if (purchase.financingType === 'loan') {
    const initialLoanAmount = calculateLoanAmount(purchase.purchasePrice, purchase.downPaymentPercent);
    primaryBalance =
      purchase.amortizationType === 'IO'
        ? Math.max(initialLoanAmount, 0)
        : calculateRemainingBalance(initialLoanAmount, Math.max(purchase.interestRate, 0), Math.max(purchase.loanTermYears, 1), elapsedYears, 'PI');
  }

  const helocBalance =
    purchase.helocAmortizationType === 'IO'
      ? Math.max(purchase.helocAmount, 0)
      : calculateRemainingBalance(
          Math.max(purchase.helocAmount, 0),
          Math.max(purchase.helocRate, 0),
          Math.max(purchase.helocTermYears, 1),
          elapsedYears,
          'PI'
        );

  return primaryBalance + helocBalance;
};

const getBrrrrRemainingDebtAtMonth = (output: StrategyOutput, input: DealInputModel, month: number) => {
  const refinancePrincipal = Math.max(output.calculationBreakdown?.brrrrMeta?.refiLoanAmount ?? 0, 0);
  if (refinancePrincipal <= 0) return 0;

  return calculateRemainingBalance(
    refinancePrincipal,
    Math.max(input.brrrr.refinanceRate, 0),
    Math.max(input.purchase.loanTermYears, 1),
    month / 12,
    'PI'
  );
};
