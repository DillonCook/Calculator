import type { AmortizationType, FinancingType } from '@/lib/models/deal';

const PMI_ANNUAL_RATE = 0.0055;

export const annualToMonthlyRate = (annualRate: number): number => annualRate / 12;

export const calculateLoanAmount = (purchasePrice: number, downPaymentPercent: number): number => {
  return purchasePrice * (1 - downPaymentPercent);
};

export const calculateMonthlyPayment = (
  principal: number,
  annualRate: number,
  termYears: number,
  amortizationType: AmortizationType = 'principalInterest'
): number => {
  const monthlyRate = annualToMonthlyRate(annualRate);
  const periods = termYears * 12;

  if (periods <= 0) return 0;
  if (amortizationType === 'interestOnly') return principal * monthlyRate;
  if (monthlyRate === 0) return principal / periods;

  const factor = Math.pow(1 + monthlyRate, periods);
  return (principal * monthlyRate * factor) / (factor - 1);
};

export const calculateMonthlyPmi = (loanAmount: number, includePmi: boolean): number => {
  if (!includePmi) return 0;
  return (loanAmount * PMI_ANNUAL_RATE) / 12;
};

export const calculateCashToClose = (
  purchasePrice: number,
  rehabBudget: number,
  downPaymentPercent: number,
  closingCostPercent: number,
  pointsPercent: number,
  financingType: FinancingType
): number => {
  const closingCosts = purchasePrice * closingCostPercent;

  if (financingType === 'cash') {
    return purchasePrice + rehabBudget + closingCosts;
  }

  const loanAmount = calculateLoanAmount(purchasePrice, downPaymentPercent);
  const downPayment = purchasePrice * downPaymentPercent;
  const points = loanAmount * pointsPercent;

  return downPayment + closingCosts + points + rehabBudget;
};
