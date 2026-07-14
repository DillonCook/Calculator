import {
  DEFAULT_INSURANCE_RATE_PERCENT,
  DEFAULT_PROPERTY_TAX_RATE_PERCENT,
  type PurchaseInputs
} from '@/lib/models/deal';

type TaxInsurancePurchaseInput = Partial<
  Pick<
    PurchaseInputs,
    | 'ownershipMode'
    | 'purchasePrice'
    | 'propertyTaxRatePercent'
    | 'insuranceRatePercent'
    | 'propertyTaxAnnualOverride'
    | 'insuranceAnnualOverride'
    | 'existingTaxMonthly'
    | 'existingInsuranceMonthly'
    | 'hoaMonthly'
    | 'pmiMonthly'
  >
>;

const finiteOrFallback = (value: number | null | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const nonNegativeFiniteOrFallback = (value: number | null | undefined, fallback: number): number =>
  Math.max(finiteOrFallback(value, fallback), 0);

export const resolvePropertyTaxRatePercent = (purchase: TaxInsurancePurchaseInput): number =>
  nonNegativeFiniteOrFallback(purchase.propertyTaxRatePercent, DEFAULT_PROPERTY_TAX_RATE_PERCENT);

export const resolveInsuranceRatePercent = (purchase: TaxInsurancePurchaseInput): number =>
  nonNegativeFiniteOrFallback(purchase.insuranceRatePercent, DEFAULT_INSURANCE_RATE_PERCENT);

export const getModeledAnnualPropertyTax = (purchase: TaxInsurancePurchaseInput): number =>
  nonNegativeFiniteOrFallback(purchase.purchasePrice, 0) * resolvePropertyTaxRatePercent(purchase);

export const getModeledAnnualInsurance = (purchase: TaxInsurancePurchaseInput): number =>
  nonNegativeFiniteOrFallback(purchase.purchasePrice, 0) * resolveInsuranceRatePercent(purchase);

export const getAnnualPropertyTax = (purchase: TaxInsurancePurchaseInput): number =>
  nonNegativeFiniteOrFallback(purchase.propertyTaxAnnualOverride, getModeledAnnualPropertyTax(purchase));

export const getAnnualInsurance = (purchase: TaxInsurancePurchaseInput): number =>
  nonNegativeFiniteOrFallback(purchase.insuranceAnnualOverride, getModeledAnnualInsurance(purchase));

export const getFixedCostBreakdown = (purchase: TaxInsurancePurchaseInput) => {
  const propertyTaxAnnual =
    purchase.ownershipMode === 'owned'
      ? nonNegativeFiniteOrFallback(purchase.existingTaxMonthly, 0) * 12
      : getAnnualPropertyTax(purchase);
  const insuranceAnnual =
    purchase.ownershipMode === 'owned'
      ? nonNegativeFiniteOrFallback(purchase.existingInsuranceMonthly, 0) * 12
      : getAnnualInsurance(purchase);
  const hoaMonthly = nonNegativeFiniteOrFallback(purchase.hoaMonthly, 0);
  const pmiMonthly = nonNegativeFiniteOrFallback(purchase.pmiMonthly, 0);

  return {
    propertyTaxAnnual,
    insuranceAnnual,
    propertyTaxMonthly: propertyTaxAnnual / 12,
    insuranceMonthly: insuranceAnnual / 12,
    hoaMonthly,
    pmiMonthly,
    totalMonthly: propertyTaxAnnual / 12 + insuranceAnnual / 12 + hoaMonthly + pmiMonthly
  };
};

export const getMonthlyFixedCosts = (purchase: TaxInsurancePurchaseInput): number =>
  getFixedCostBreakdown(purchase).totalMonthly;
