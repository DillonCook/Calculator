import type { AmortizationType } from '@/lib/models/deal';

export const annualToMonthlyRate = (annualRate: number): number => annualRate / 12;

export const calculateLoanAmount = (purchasePrice: number, downPaymentPercent: number): number => {
  const normalizedPrice = Math.max(Number.isFinite(purchasePrice) ? purchasePrice : 0, 0);
  const normalizedDownPayment = Math.min(Math.max(Number.isFinite(downPaymentPercent) ? downPaymentPercent : 0, 0), 1);
  return normalizedPrice * (1 - normalizedDownPayment);
};

export const calculateMonthlyPayment = (
  principal: number,
  annualRate: number,
  termYears: number
): number => {
  const normalizedPrincipal = Math.max(Number.isFinite(principal) ? principal : 0, 0);
  const monthlyRate = annualToMonthlyRate(Math.max(Number.isFinite(annualRate) ? annualRate : 0, 0));
  const periods = Math.max(Number.isFinite(termYears) ? termYears : 0, 0) * 12;

  if (normalizedPrincipal <= 0 || periods <= 0) return 0;
  if (monthlyRate === 0) return normalizedPrincipal / periods;

  const discountFactor = Math.pow(1 + monthlyRate, -periods);
  return (normalizedPrincipal * monthlyRate) / (1 - discountFactor);
};

export const calculateInterestOnlyPayment = (principal: number, annualRate: number): number => {
  if (!Number.isFinite(principal) || !Number.isFinite(annualRate) || principal <= 0 || annualRate <= 0) return 0;
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
  existingMortgageMonthly = 0,
  existingMortgageBalance = 0
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
  existingMortgageBalance?: number;
  existingMortgageRate?: number;
  existingMortgageRemainingYears?: number;
}) => {
  if (existingMortgageMonthly > 0 || existingMortgageBalance > 0) {
    const existingPrincipal = Math.max(existingMortgageBalance, 0);
    const existingDebtService = Math.max(existingMortgageMonthly, 0);
    const helocPrincipal = Math.max(helocAmount, 0);
    const helocDebtService =
      helocAmortizationType === 'IO'
        ? calculateInterestOnlyPayment(helocPrincipal, helocRate)
        : calculateMonthlyPayment(helocPrincipal, helocRate, helocTermYears);

    return {
      primaryPrincipal: existingPrincipal,
      primaryDebtService: existingDebtService,
      helocPrincipal,
      helocDebtService,
      principal: existingPrincipal + helocPrincipal,
      debtService: existingDebtService + helocDebtService
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
  const normalizedPurchasePrice = Math.max(Number.isFinite(purchasePrice) ? purchasePrice : 0, 0);
  const normalizedRehabBudget = Math.max(Number.isFinite(rehabBudget) ? rehabBudget : 0, 0);
  const normalizedDownPayment = Math.min(Math.max(Number.isFinite(downPaymentPercent) ? downPaymentPercent : 0, 0), 1);
  const normalizedClosingCostPercent = Math.max(Number.isFinite(closingCostPercent) ? closingCostPercent : 0, 0);
  const normalizedPointsPercent = Math.max(Number.isFinite(pointsPercent) ? pointsPercent : 0, 0);
  const closingCosts = normalizedPurchasePrice * normalizedClosingCostPercent;

  const baseCashToClose =
    financingType === 'cash'
      ? normalizedPurchasePrice + normalizedRehabBudget + closingCosts
      : normalizedPurchasePrice * normalizedDownPayment +
        closingCosts +
        calculateLoanAmount(normalizedPurchasePrice, normalizedDownPayment) * normalizedPointsPercent +
        normalizedRehabBudget;

  return Math.max(baseCashToClose - Math.max(helocAmount, 0), 0) + Math.max(helocClosingCosts, 0);
};
