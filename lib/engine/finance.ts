import type { AmortizationType, FinancingType } from '@/lib/models/deal';

export const annualToMonthlyRate = (annualRate: number): number => annualRate / 12;

export const calculateLoanAmount = (purchasePrice: number, downPaymentPercent: number): number => {
  return purchasePrice * (1 - downPaymentPercent);
};

export const calculateMonthlyPayment = (
  principal: number,
  annualRate: number,
  termYears: number
): number => {
  const monthlyRate = annualToMonthlyRate(annualRate);
  const periods = termYears * 12;

  if (periods <= 0) return 0;
  if (monthlyRate === 0) return principal / periods;

  const factor = Math.pow(1 + monthlyRate, periods);
  return (principal * monthlyRate * factor) / (factor - 1);
};

export const calculateInterestOnlyPayment = (principal: number, annualRate: number): number => {
  if (principal <= 0 || annualRate <= 0) return 0;
  return (principal * annualRate) / 12;
};

export const calculateAcquisitionDebtService = ({
  financingType,
  amortizationType,
  purchasePrice,
  downPaymentPercent,
  interestRate,
  loanTermYears,
  helocAmount,
  helocRate
}: {
  financingType: FinancingType;
  amortizationType: AmortizationType;
  purchasePrice: number;
  downPaymentPercent: number;
  interestRate: number;
  loanTermYears: number;
  helocAmount: number;
  helocRate: number;
}) => {
  if (financingType === 'cash') return { principal: 0, debtService: 0 };

  if (financingType === 'heloc') {
    return {
      principal: helocAmount,
      debtService: calculateInterestOnlyPayment(helocAmount, helocRate)
    };
  }

  const principal = calculateLoanAmount(purchasePrice, downPaymentPercent);
  const debtService =
    amortizationType === 'IO'
      ? calculateInterestOnlyPayment(principal, interestRate)
      : calculateMonthlyPayment(principal, interestRate, loanTermYears);

  return { principal, debtService };
};

export const calculateCashToClose = (
  purchasePrice: number,
  rehabBudget: number,
  downPaymentPercent: number,
  closingCostPercent: number,
  pointsPercent: number,
  financingType: FinancingType,
  helocClosingCosts = 0
): number => {
  const closingCosts = purchasePrice * closingCostPercent;

  if (financingType === 'cash') {
    return purchasePrice + rehabBudget + closingCosts;
  }

  if (financingType === 'heloc') {
    return purchasePrice + rehabBudget + closingCosts + helocClosingCosts;
  }

  const loanAmount = calculateLoanAmount(purchasePrice, downPaymentPercent);
  const downPayment = purchasePrice * downPaymentPercent;
  const points = loanAmount * pointsPercent;

  return downPayment + closingCosts + points + rehabBudget;
};
