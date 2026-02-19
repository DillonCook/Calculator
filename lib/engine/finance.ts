import type { AmortizationType } from '@/lib/models/deal';

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
  helocRate,
  helocTermYears,
  helocAmortizationType,
  existingMortgageMonthly = 0
}: {
  financingType: 'cash' | 'loan';
  amortizationType: AmortizationType;
  purchasePrice: number;
  downPaymentPercent: number;
  interestRate: number;
  loanTermYears: number;
  helocAmount: number;
  helocRate: number;
  helocTermYears: number;
  helocAmortizationType: AmortizationType;
  existingMortgageMonthly?: number;
}) => {
  if (existingMortgageMonthly > 0) {
    const helocPrincipal = Math.max(helocAmount, 0);
    const helocDebtService =
      helocAmortizationType === 'IO'
        ? calculateInterestOnlyPayment(helocPrincipal, helocRate)
        : calculateMonthlyPayment(helocPrincipal, helocRate, helocTermYears);

    return {
      primaryPrincipal: 0,
      primaryDebtService: existingMortgageMonthly,
      helocPrincipal,
      helocDebtService,
      principal: helocPrincipal,
      debtService: existingMortgageMonthly + helocDebtService
    };
  }

  const primaryPrincipal = financingType === 'loan' ? calculateLoanAmount(purchasePrice, downPaymentPercent) : 0;
  const primaryDebtService =
    financingType === 'loan'
      ? amortizationType === 'IO'
        ? calculateInterestOnlyPayment(primaryPrincipal, interestRate)
        : calculateMonthlyPayment(primaryPrincipal, interestRate, loanTermYears)
      : 0;

  const helocPrincipal = Math.max(helocAmount, 0);
  const helocDebtService =
    helocAmortizationType === 'IO'
      ? calculateInterestOnlyPayment(helocPrincipal, helocRate)
      : calculateMonthlyPayment(helocPrincipal, helocRate, helocTermYears);

  return {
    primaryPrincipal,
    primaryDebtService,
    helocPrincipal,
    helocDebtService,
    principal: primaryPrincipal + helocPrincipal,
    debtService: primaryDebtService + helocDebtService
  };
};

export const calculateCashToClose = (
  purchasePrice: number,
  rehabBudget: number,
  downPaymentPercent: number,
  closingCostPercent: number,
  pointsPercent: number,
  financingType: 'cash' | 'loan',
  helocAmount = 0,
  helocClosingCosts = 0
): number => {
  const closingCosts = purchasePrice * closingCostPercent;

  const baseCashToClose =
    financingType === 'cash'
      ? purchasePrice + rehabBudget + closingCosts
      : purchasePrice * downPaymentPercent + closingCosts + calculateLoanAmount(purchasePrice, downPaymentPercent) * pointsPercent + rehabBudget;

  return Math.max(baseCashToClose - Math.max(helocAmount, 0), 0) + Math.max(helocClosingCosts, 0);
};
