import type { AmortizationType } from '@/lib/models/deal';
import { annualToMonthlyRate, calculateInterestOnlyPayment, calculateMonthlyPayment } from '@/lib/engine/finance';

export const calculateRemainingBalance = (
  principal: number,
  annualRate: number,
  termYears: number,
  elapsedYears: number,
  amortizationType: AmortizationType = 'PI'
): number => {
  const normalizedPrincipal = Math.max(Number.isFinite(principal) ? principal : 0, 0);
  const normalizedAnnualRate = Math.max(Number.isFinite(annualRate) ? annualRate : 0, 0);
  const periods = Math.max((Number.isFinite(termYears) ? termYears : 0) * 12, 0);
  const paidPeriods = Math.min(Math.max((Number.isFinite(elapsedYears) ? elapsedYears : 0) * 12, 0), periods);

  if (normalizedPrincipal <= 0 || periods <= 0 || paidPeriods >= periods) return 0;
  if (amortizationType === 'IO') return normalizedPrincipal;

  const monthlyRate = annualToMonthlyRate(normalizedAnnualRate);

  if (monthlyRate === 0) {
    const paidPrincipal = (normalizedPrincipal / periods) * paidPeriods;
    return Math.max(normalizedPrincipal - paidPrincipal, 0);
  }

  const factorPaid = Math.pow(1 + monthlyRate, paidPeriods);
  const payment = calculateMonthlyPayment(normalizedPrincipal, normalizedAnnualRate, periods / 12);
  return Math.max(normalizedPrincipal * factorPaid - payment * ((factorPaid - 1) / monthlyRate), 0);
};

export const calculateRemainingBalanceWithPayment = (
  principal: number,
  annualRate: number,
  monthlyPayment: number,
  termYears: number,
  elapsedYears: number
): number => {
  const normalizedPrincipal = Math.max(Number.isFinite(principal) ? principal : 0, 0);
  const normalizedRate = Math.max(Number.isFinite(annualRate) ? annualRate : 0, 0) / 12;
  const normalizedPayment = Math.max(Number.isFinite(monthlyPayment) ? monthlyPayment : 0, 0);
  const termMonths = Math.max(Number.isFinite(termYears) ? termYears : 0, 0) * 12;
  const elapsedMonths = Math.max(Number.isFinite(elapsedYears) ? elapsedYears : 0, 0) * 12;
  if (normalizedPrincipal <= 0 || elapsedMonths >= termMonths - 1e-9) return 0;

  let balance = normalizedPrincipal;
  let remainingMonths = Math.min(elapsedMonths, termMonths);
  while (remainingMonths > 1e-9 && balance > 1e-9) {
    const fraction = Math.min(remainingMonths, 1);
    balance *= 1 + normalizedRate * fraction;
    balance -= Math.min(normalizedPayment * fraction, balance);
    remainingMonths -= fraction;
  }

  return Math.max(balance, 0);
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
      ? calculateRemainingBalance(initialLoanAmount, annualRate, termYears, elapsedYears, amortizationType)
      : 0;

  const helocBalance = calculateRemainingBalance(
    Math.max(helocAmount, 0),
    helocRate,
    helocTermYears,
    elapsedYears,
    helocAmortizationType
  );

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
  const normalizedPurchasePrice = Math.max(Number.isFinite(purchasePrice) ? purchasePrice : 0, 0);
  const normalizedArv = Math.max(Number.isFinite(arv) ? arv : 0, 0);
  const normalizedAppreciation = Math.max(Number.isFinite(annualAppreciationPercent) ? annualAppreciationPercent : 0, -0.999999);
  const normalizedSellingCosts = Math.min(Math.max(Number.isFinite(sellingCostPercent) ? sellingCostPercent : 0, 0), 1);
  const normalizedBalance = Math.max(Number.isFinite(remainingLoanBalance) ? remainingLoanBalance : 0, 0);
  const normalizedHoldYears = Math.max(Number.isFinite(holdYears) ? holdYears : 0, 0);
  const baseValue = normalizedArv > 0 ? normalizedArv : normalizedPurchasePrice;
  const salePrice = baseValue * Math.pow(1 + normalizedAppreciation, normalizedHoldYears);
  const sellingCosts = salePrice * normalizedSellingCosts;
  return salePrice - sellingCosts - normalizedBalance;
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

export interface ExcelParityDebtDetails {
  principal: number;
  annualRate: number;
  termMonths: number;
  amortizationType: AmortizationType;
}

export interface ExcelParityAnnualTimelineInput {
  initialCashInvested: number;
  annualNoiYear1: number;
  holdYears: number;
  noiGrowthRate: number;
  appreciationRate: number;
  sellingCostRate: number;
  purchasePrice: number;
  arv: number;
  debts?: ExcelParityDebtDetails[];
}

export interface ExcelParityAnnualTimelineResult {
  flows: number[];
  noiByYear: number[];
  propertyValueByYear: number[];
  annualDebtService: number;
  remainingLoanBalance: number;
  netSaleProceeds: number;
  totalRoi: number;
  irr: number;
}

const getDebtMonthlyPayment = (debt: ExcelParityDebtDetails): number => {
  if (debt.principal <= 0) return 0;

  if (debt.amortizationType === 'IO') {
    return calculateInterestOnlyPayment(debt.principal, debt.annualRate);
  }

  const termYears = debt.termMonths / 12;
  return calculateMonthlyPayment(debt.principal, debt.annualRate, termYears);
};

const getDebtRemainingBalanceAtMonth = (debt: ExcelParityDebtDetails, monthsElapsed: number): number => {
  if (debt.principal <= 0) return 0;
  if (debt.amortizationType === 'IO') return debt.principal;

  const termYears = debt.termMonths / 12;
  const elapsedYears = monthsElapsed / 12;
  return calculateRemainingBalance(debt.principal, debt.annualRate, termYears, elapsedYears, 'PI');
};

export const buildExcelParityAnnualTimeline = ({
  initialCashInvested,
  annualNoiYear1,
  holdYears,
  noiGrowthRate,
  appreciationRate,
  sellingCostRate,
  purchasePrice,
  arv,
  debts = []
}: ExcelParityAnnualTimelineInput): ExcelParityAnnualTimelineResult => {
  const normalizedHoldYears = Math.max(holdYears, 0);
  const fullHoldYears = Math.floor(normalizedHoldYears);
  const partialYearPortion = normalizedHoldYears - fullHoldYears;
  const monthsElapsed = normalizedHoldYears * 12;
  const baseValue = arv > 0 ? arv : purchasePrice;

  const annualDebtService = debts.reduce((sum, debt) => sum + getDebtMonthlyPayment(debt) * 12, 0);
  const remainingLoanBalance = debts.reduce((sum, debt) => sum + getDebtRemainingBalanceAtMonth(debt, monthsElapsed), 0);

  const noiByYear: number[] = [];
  const propertyValueByYear: number[] = [];
  const flows = [-Math.abs(initialCashInvested)];

  for (let year = 1; year <= fullHoldYears; year += 1) {
    const noiForYear = annualNoiYear1 * Math.pow(1 + noiGrowthRate, year - 1);
    const propertyValueForYear = baseValue * Math.pow(1 + appreciationRate, year);
    const annualCashFlow = noiForYear - annualDebtService;

    noiByYear.push(noiForYear);
    propertyValueByYear.push(propertyValueForYear);

    flows.push(annualCashFlow);
  }

  const terminalPropertyValue =
    normalizedHoldYears > 0
      ? baseValue * Math.pow(1 + appreciationRate, normalizedHoldYears)
      : baseValue;
  const netSaleProceeds = terminalPropertyValue * (1 - sellingCostRate) - remainingLoanBalance;

  if (partialYearPortion > 0) {
    const partialNoi = annualNoiYear1 * Math.pow(1 + noiGrowthRate, fullHoldYears) * partialYearPortion;
    const partialDebtService = annualDebtService * partialYearPortion;
    flows.push(partialNoi - partialDebtService + netSaleProceeds);
  } else if (fullHoldYears > 0) {
    flows[fullHoldYears] += netSaleProceeds;
  } else {
    flows.push(netSaleProceeds);
  }

  return {
    flows,
    noiByYear,
    propertyValueByYear,
    annualDebtService,
    remainingLoanBalance,
    netSaleProceeds,
    totalRoi: calcTotalRoiFromTimeline(flows),
    irr: calculateIrr(flows)
  };
};

export const calcTotalRoiFromTimeline = (timeline: number[]): number => {
  if (timeline.length === 0 || timeline.some((flow) => !Number.isFinite(flow))) return 0;
  const firstMaterialFlow = timeline.find((flow) => Math.abs(flow) > 1e-9);
  if (firstMaterialFlow === undefined || firstMaterialFlow > 0) return 0;

  const totalInvested = timeline.reduce((sum, flow) => sum + (flow < 0 ? -flow : 0), 0);
  if (totalInvested <= 1e-9) return 0;

  const totalProfit = timeline.reduce((sum, flow) => sum + flow, 0);
  return totalProfit / totalInvested;
};

const calculateNpv = (cashFlows: number[], rate: number, times?: number[]): number => {
  if (rate < -0.9999) return Number.NaN;

  let npv = 0;
  for (let t = 0; t < cashFlows.length; t += 1) {
    npv += cashFlows[t] / Math.pow(1 + rate, times?.[t] ?? t);
  }

  return npv;
};

export const calculateIrrForTimes = (cashFlows: number[], times: number[]): number => {
  if (cashFlows.length < 2 || times.length !== cashFlows.length) return 0;
  if (times.some((time, index) => !Number.isFinite(time) || time < 0 || (index > 0 && time <= times[index - 1]!))) return 0;

  const hasPositive = cashFlows.some((flow) => flow > 0);
  const hasNegative = cashFlows.some((flow) => flow < 0);

  if (!hasPositive || !hasNegative) return 0;

  const minRate = -0.9999;
  const maxScanRate = 10;
  const maxExpansionRate = 1_000_000;
  const scanStep = 0.01;

  let lowerRate = minRate;
  let lowerNpv = calculateNpv(cashFlows, lowerRate, times);

  if (!Number.isFinite(lowerNpv)) return 0;

  const solveBracket = (leftRate: number, rightRate: number, leftValue: number) => {
    let left = leftRate;
    let right = rightRate;
    let leftNpv = leftValue;

    for (let i = 0; i < 200; i += 1) {
      const mid = (left + right) / 2;
      const midNpv = calculateNpv(cashFlows, mid, times);

      if (!Number.isFinite(midNpv)) return 0;
      if (Math.abs(midNpv) < 1e-10 || Math.abs(right - left) < 1e-10) return mid;

      if (leftNpv * midNpv < 0) {
        right = mid;
      } else {
        left = mid;
        leftNpv = midNpv;
      }
    }

    return (left + right) / 2;
  };

  const scanRate = (rate: number) => {
    const upperNpv = calculateNpv(cashFlows, rate, times);
    if (!Number.isFinite(upperNpv)) return null;
    if (Math.abs(upperNpv) < 1e-10) return rate;
    if (Math.abs(lowerNpv) < 1e-10) return lowerRate;
    if (lowerNpv * upperNpv < 0) return solveBracket(lowerRate, rate, lowerNpv);

    lowerRate = rate;
    lowerNpv = upperNpv;
    return null;
  };

  for (let rate = minRate + scanStep; rate < maxScanRate; rate += scanStep) {
    const solvedRate = scanRate(rate);
    if (solvedRate !== null) return solvedRate;
  }

  const maxScanSolution = scanRate(maxScanRate);
  if (maxScanSolution !== null) return maxScanSolution;

  for (let rate = maxScanRate * 2 + 1; rate <= maxExpansionRate; rate = rate * 2 + 1) {
    const solvedRate = scanRate(rate);
    if (solvedRate !== null) return solvedRate;
  }

  return 0;
};

export const calculateIrr = (cashFlows: number[]): number =>
  calculateIrrForTimes(
    cashFlows,
    cashFlows.map((_, index) => index)
  );
