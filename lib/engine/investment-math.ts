import type { AmortizationType } from '@/lib/models/deal';
import { annualToMonthlyRate } from '@/lib/engine/finance';

export const calculateRemainingBalance = (
  principal: number,
  annualRate: number,
  termYears: number,
  elapsedYears: number,
  amortizationType: AmortizationType = 'PI'
): number => {
  if (principal <= 0) return 0;
  if (amortizationType === 'IO') return principal;

  const monthlyRate = annualToMonthlyRate(annualRate);
  const periods = Math.max(termYears * 12, 1);
  const paidPeriods = Math.min(Math.max(Math.round(elapsedYears * 12), 0), periods);

  if (monthlyRate === 0) {
    const paidPrincipal = (principal / periods) * paidPeriods;
    return Math.max(principal - paidPrincipal, 0);
  }

  const factor = Math.pow(1 + monthlyRate, periods);
  const factorPaid = Math.pow(1 + monthlyRate, paidPeriods);
  const numerator = factor - factorPaid;
  const denominator = factor - 1;

  return principal * (numerator / denominator);
};

export const getAcquisitionDebtPayoffAtMonth = ({
  financingType,
  initialLoanAmount,
  annualRate,
  termYears,
  monthsElapsed,
  amortizationType,
  helocAmount,
  helocRate,
  helocTermYears,
  helocAmortizationType
}: {
  financingType: 'cash' | 'loan';
  initialLoanAmount: number;
  annualRate: number;
  termYears: number;
  monthsElapsed: number;
  amortizationType: AmortizationType;
  helocAmount: number;
  helocRate: number;
  helocTermYears: number;
  helocAmortizationType: AmortizationType;
}): number => {
  const elapsedYears = monthsElapsed / 12;

  const primaryBalance =
    financingType === 'loan'
      ? amortizationType === 'IO'
        ? Math.max(initialLoanAmount, 0)
        : calculateRemainingBalance(initialLoanAmount, annualRate, termYears, elapsedYears, 'PI')
      : 0;

  const helocBalance =
    helocAmortizationType === 'IO'
      ? Math.max(helocAmount, 0)
      : calculateRemainingBalance(Math.max(helocAmount, 0), helocRate, helocTermYears, elapsedYears, 'PI');

  return primaryBalance + helocBalance;
};

export const estimateSaleProceeds = (
  purchasePrice: number,
  arv: number,
  annualAppreciationPercent: number,
  sellingCostPercent: number,
  remainingLoanBalance: number,
  holdYears: number
): number => {
  const baseValue = arv > 0 ? arv : purchasePrice;
  const salePrice = baseValue * Math.pow(1 + annualAppreciationPercent, holdYears);
  const sellingCosts = salePrice * sellingCostPercent;
  return salePrice - sellingCosts - remainingLoanBalance;
};

export const buildTimeline = (
  initialCashOut: number,
  baseAnnualCashFlow: number,
  holdYears: number,
  noiGrowthPercent: number,
  saleProceeds: number
): number[] => {
  const timeline = [-Math.abs(initialCashOut)];

  for (let year = 1; year <= holdYears; year += 1) {
    const grownAnnualCashFlow = baseAnnualCashFlow * Math.pow(1 + noiGrowthPercent, year - 1);
    const saleEvent = year === holdYears ? saleProceeds : 0;
    timeline.push(grownAnnualCashFlow + saleEvent);
  }

  return timeline;
};

export const buildSpreadsheetStyleTimeline = ({
  initialCashOut,
  baseAnnualNoi,
  annualDebtService,
  holdYears,
  noiGrowthPercent,
  saleProceeds
}: {
  initialCashOut: number;
  baseAnnualNoi: number;
  annualDebtService: number;
  holdYears: number;
  noiGrowthPercent: number;
  saleProceeds: number;
}): number[] => {
  const timeline = [-Math.abs(initialCashOut)];

  for (let year = 1; year <= holdYears; year += 1) {
    const noiForYear = baseAnnualNoi * Math.pow(1 + noiGrowthPercent, year - 1);
    const annualCashFlow = noiForYear - annualDebtService;
    const saleEvent = year === holdYears ? saleProceeds : 0;
    timeline.push(annualCashFlow + saleEvent);
  }

  return timeline;
};

export const calculateIrr = (cashFlows: number[]): number => {
  if (cashFlows.length < 2) return 0;

  const hasPositive = cashFlows.some((flow) => flow > 0);
  const hasNegative = cashFlows.some((flow) => flow < 0);

  if (!hasPositive || !hasNegative) return 0;

  let rate = 0.12;

  for (let i = 0; i < 100; i += 1) {
    let npv = 0;
    let derivative = 0;

    for (let t = 0; t < cashFlows.length; t += 1) {
      const discountFactor = Math.pow(1 + rate, t);
      npv += cashFlows[t] / discountFactor;

      if (t > 0) {
        derivative -= (t * cashFlows[t]) / Math.pow(1 + rate, t + 1);
      }
    }

    if (Math.abs(derivative) < 1e-10) break;

    const nextRate = rate - npv / derivative;

    if (!Number.isFinite(nextRate) || nextRate <= -0.9999 || nextRate > 10) {
      break;
    }

    if (Math.abs(nextRate - rate) < 1e-8) {
      rate = nextRate;
      break;
    }

    rate = nextRate;
  }

  return Number.isFinite(rate) ? rate : 0;
};
