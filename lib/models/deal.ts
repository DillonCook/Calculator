export type FinancingType = 'cash' | 'loan';

export type AmortizationType = 'PI' | 'IO';

export type StrategyKey = 'purchase' | 'longTerm' | 'airbnb' | 'padSplit' | 'brrrr' | 'flip';
export const strategyKeyOrder: StrategyKey[] = ['purchase', 'longTerm', 'airbnb', 'padSplit', 'brrrr', 'flip'];
export const isStrategyKey = (value: unknown): value is StrategyKey =>
  typeof value === 'string' && strategyKeyOrder.includes(value as StrategyKey);

export type ExpenseStrategyKey = 'purchase' | 'longTerm' | 'airbnb' | 'padSplit' | 'flip';

export type BrrrrOperatingStrategy = 'longTerm' | 'airbnb' | 'padSplit';

export const DEFAULT_PROPERTY_TAX_RATE_PERCENT = 0.017;
export const DEFAULT_INSURANCE_RATE_PERCENT = 0.01;

export interface DealUiState {
  activeStrategy: StrategyKey;
  projectionStrategies: StrategyKey[];
}

export const defaultDealUiState: DealUiState = {
  activeStrategy: 'purchase',
  projectionStrategies: [...strategyKeyOrder]
};

export const normalizeProjectionStrategySelection = (value: unknown): StrategyKey[] => {
  const input = Array.isArray(value) ? value : [];
  const next = strategyKeyOrder.filter((strategy) => input.includes(strategy));
  return next.length > 0 ? next : [...defaultDealUiState.projectionStrategies];
};

export const normalizeDealUiState = (value: unknown): DealUiState => {
  const input = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

  return {
    activeStrategy: isStrategyKey(input.activeStrategy) ? input.activeStrategy : defaultDealUiState.activeStrategy,
    projectionStrategies: normalizeProjectionStrategySelection(input.projectionStrategies)
  };
};

export interface PurchaseInputs {
  ownershipMode: 'purchase' | 'owned';
  dealName: string;
  listingUrl: string;
  purchasePrice: number;
  rehabBudget: number;
  arv: number;
  downPaymentPercent: number;
  closingCostPercent: number;
  interestRate: number;
  loanTermYears: number;
  pointsPercent: number;
  financingType: FinancingType;
  amortizationType: AmortizationType;
  helocAmount: number;
  helocRate: number;
  helocTermYears: number;
  helocAmortizationType: AmortizationType;
  helocClosingCosts: number;
  propertyTaxRatePercent: number;
  insuranceRatePercent: number;
  propertyTaxAnnualOverride: number | null;
  insuranceAnnualOverride: number | null;
  hoaMonthly: number;
  pmiMonthly: number;
  ownedPurchasePrice: number;
  ownedMoneyDown: number;
  ownedAdditionalInvested: number;
  existingMortgageMonthly: number;
  existingMortgageBalance: number;
  existingMortgageRate: number;
  existingMortgageRemainingYears: number;
  existingTaxMonthly: number;
  existingInsuranceMonthly: number;
}

export interface LongTermInputs {
  grossRentMonthly: number;
  otherIncomeMonthly: number;
  annualRevenueOverride: number | null;
  tenantPlacementFeePercent: number;
  arvOverride: number | null;
  vacancyPercent: number;
  maintenancePercent: number;
  capexPercent: number;
  managementFeePercent: number;
  ownerExpensesMonthly: number;
  turnaround: LongTermTurnaroundInputs;
}

export interface LongTermTurnaroundInputs {
  enabled: boolean;
  stabilizedGrossRentMonthly: number;
  stabilizedOtherIncomeMonthly: number;
  laundryIncomeMonthly: number;
  vendingMiscIncomeMonthly: number;
  garageIncomeMonthly: number;
  parkingIncomeMonthly: number;
  additionalIncomeMonthly: number;
  rehabBudgetForStabilization: number;
  annualTaxInsuranceAdjustment: number;
  vacancyPercent: number;
  maintenancePercent: number;
  capexPercent: number;
  ownerPaidExpensesMonthly: number;
  managementFeePercent: number;
  exitRefiCapRatePercent: number;
}

export interface CommercialInputs {
  grossLeasableAreaSqft: number;
  occupiedSqft: number;
  averageBaseRentPerSqftYear: number;
  nnnRecoveryPerSqftYear: number;
  vacancyPercent: number;
  creditLossPercent: number;
  nonRecoverableExpensesPerSqftYear: number;
  managementFeePercent: number;
  tenantImprovementsReservePerSqftYear: number;
  leasingCommissionsReservePerSqftYear: number;
  annualRentGrowthPercent: number;
  annualExpenseGrowthPercent: number;
}

export interface AirbnbInputs {
  adr: number;
  arvOverride: number | null;
  annualRevenueOverride: number | null;
  occupancyPercent: number;
  nightsPerMonth: number;
  platformFeePercent: number;
  cleaningFeeCharged: number;
  cleanerCostPerTurn: number;
  averageNightsPerBooking: number;
  maintenancePercent: number;
  capexPercent: number;
  managementFeePercent: number;
  ownerExpensesMonthly: number;
  furnishingOneTime: number;
}

export interface PadSplitInputs {
  rentableRooms: number;
  arvOverride: number | null;
  annualRevenueOverride: number | null;
  avgWeeklyRatePerRoom: number;
  occupancyPercent: number;
  weeksPerMonth: number;
  otherIncomeMonthly: number;
  platformFeePercent: number;
  maintenancePercent: number;
  capexPercent: number;
  managementFeePercent: number;
  turnoverCostPerMoveOut: number;
  moveOutsPerYear: number;
  ownerExpensesMonthly: number;
  furnishingOneTime: number;
}

export interface StrategyCalculationLineItem {
  key: string;
  label: string;
  monthly: number;
  annual: number;
}

export interface StrategyCalculationBreakdown {
  lines: StrategyCalculationLineItem[];
  revenueMonthly: number;
  sellerPaidExpensesMonthly: number;
  debtServiceMonthly: number;
  noiMonthly: number;
  cashFlowMonthly: number;
  brrrrMeta?: {
    operatingStrategy: BrrrrOperatingStrategy;
    holdingMonths: number;
    purchaseCashComponent: number;
    buyClosingCosts: number;
    pointsCost: number;
    rehabBudget: number;
    helocOffset: number;
    helocClosingCosts: number;
    setupCostOneTime: number;
    monthlyHoldingExpenses: number;
    fixedHoldingCostsMonthly: number;
    variableHoldingCostsMonthly: number;
    lenderHoldingCostsMonthly: number;
    holdingCostsTotal: number;
    investedAtPurchase: number;
    arvAtRefi: number;
    refiLoanAmount: number;
    refiClosingCosts: number;
    initialLoanPayoff: number;
    cashBackAtRefiNet: number;
    investedAfterRefi: number;
    selectedOperatingNoi: number;
    refinanceDebt: number;
  };
  flipMeta?: {
    holdingMonths: number;
    salePrice: number;
    purchasePrice: number;
    rehabBudget: number;
    buyClosingCosts: number;
    agentCommission: number;
    sellClosingCosts: number;
    sellerConcessions: number;
    fixedHoldingCostsMonthly: number;
    variableHoldingCostsMonthly: number;
    lenderHoldingCostsMonthly: number;
    holdingCostsTotal: number;
    netProfit: number;
  };
}

export interface BrrrrInputs {
  holdingMonths: number;
  holdingExpensesMonthly: number;
  arvOverride: number | null;
  rehabOverride: number | null;
  refinanceLtvPercent: number;
  refinanceRate: number;
  refinanceClosingCostPercent: number;
  operatingStrategy: BrrrrOperatingStrategy;
}

export interface FlipInputs {
  holdingMonths: number;
  arvOverride: number | null;
  rehabOverride: number | null;
  agentCommissionPercent: number;
  sellClosingCostPercent: number;
  sellerConcessions: number;
}

export interface VariableExpenseCategory {
  key: string;
  label: string;
  monthlyAmount: number;
  appliesTo: Record<ExpenseStrategyKey, boolean>;
}

export interface MasterAssumptions {
  holdYears: number;
  annualAppreciationPercent: number;
  sellingCostPercent: number;
  noiGrowthPercent: number;
  targetIrrPercent: number;
}

export interface CommercialSummaryOutput {
  grossLeasableAreaSqft: number;
  occupiedSqft: number;
  physicalOccupancyPercent: number;
  averageBaseRentPerSqftYear: number;
  nnnRecoveryPerSqftYear: number;
  annualPotentialGrossIncome: number;
  annualPhysicalVacancyLoss: number;
  annualEconomicVacancyLoss: number;
  annualCreditLoss: number;
  annualEffectiveGrossIncome: number;
  annualOperatingExpenses: number;
  annualNoi: number;
  annualDebtService: number;
  debtYield: number;
  breakEvenOccupancyPercent: number;
}

export interface LongTermTurnaroundSummaryOutput {
  enabled: boolean;
  stabilizedGrossMonthlyRent: number;
  stabilizedOtherIncomeMonthly: number;
  laundryIncomeMonthly: number;
  vendingMiscIncomeMonthly: number;
  garageIncomeMonthly: number;
  parkingIncomeMonthly: number;
  additionalIncomeMonthly: number;
  stabilizedGrossIncomeMonthly: number;
  effectiveGrossIncomeMonthly: number;
  rehabBudgetForStabilization: number;
  annualTaxInsuranceAdjustment: number;
  vacancyPercent: number;
  maintenancePercent: number;
  capexPercent: number;
  ownerPaidExpensesMonthly: number;
  managementFeePercent: number;
  exitRefiCapRatePercent: number;
  operatingExpensesMonthly: number;
  noiMonthly: number;
  debtServiceMonthly: number;
  cashFlowPreTaxMonthly: number;
  cashFlowExcludingReservesMonthly: number;
  annualNoi: number;
  annualCashFlowPreTax: number;
  totalCashInvested: number;
  dscr: number;
  capRate: number;
  cashOnCashReturn: number;
  irr: number;
  roi: number;
  impliedValueAtExitCap: number;
  capOnCost: number;
  equityCreated: number;
}

export interface DealInputModel {
  purchase: PurchaseInputs;
  commercial: CommercialInputs;
  longTerm: LongTermInputs;
  airbnb: AirbnbInputs;
  padSplit: PadSplitInputs;
  brrrr: BrrrrInputs;
  flip: FlipInputs;
  variableExpenses: VariableExpenseCategory[];
  assumptions: MasterAssumptions;
  uiState?: DealUiState;
}

export interface StrategyOutput {
  strategy: StrategyKey;
  monthlyCashFlow: number;
  monthlyCashFlowExcludingReserves?: number;
  annualCashFlow: number;
  capRate: number;
  cashOnCashReturn: number;
  dscr: number;
  roi: number;
  irr: number;
  totalCashNeeded: number;
  notes: string;
  noiMonthly?: number;
  saleProceeds?: number;
  cashFlowTimeline: number[];
  calculationBreakdown?: StrategyCalculationBreakdown;
  commercialSummary?: CommercialSummaryOutput;
  longTermTurnaroundSummary?: LongTermTurnaroundSummaryOutput;
}

export interface MasterSummary {
  cashToClose: number;
  monthlyCashFlow: number;
  cashOnCashReturn: number;
  roi: number;
  irr: number;
}

export interface DealResult {
  purchase: StrategyOutput;
  longTerm: StrategyOutput;
  airbnb: StrategyOutput;
  padSplit: StrategyOutput;
  brrrr: StrategyOutput;
  flip: StrategyOutput;
  masterSummary: MasterSummary;
}

export interface ScenarioRecord {
  schemaVersion: '1.0.0';
  scenarioId: string;
  appVersion: string;
  dealName: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  notes?: string;
  payload: DealInputModel;
}

export const defaultDealInput: DealInputModel = {
  purchase: {
    ownershipMode: 'purchase',
    dealName: 'Tampa Duplex - Sample Deal',
    listingUrl: '',
    purchasePrice: 285000,
    rehabBudget: 25000,
    arv: 285000,
    downPaymentPercent: 0.2,
    closingCostPercent: 0.015,
    interestRate: 0.068,
    loanTermYears: 30,
    pointsPercent: 0.01,
    financingType: 'loan',
    amortizationType: 'PI',
    helocAmount: 0,
    helocRate: 0.09,
    helocTermYears: 15,
    helocAmortizationType: 'PI',
    helocClosingCosts: 0,
    propertyTaxRatePercent: DEFAULT_PROPERTY_TAX_RATE_PERCENT,
    insuranceRatePercent: DEFAULT_INSURANCE_RATE_PERCENT,
    propertyTaxAnnualOverride: null,
    insuranceAnnualOverride: null,
    hoaMonthly: 0,
    pmiMonthly: 0,
    ownedPurchasePrice: 0,
    ownedMoneyDown: 0,
    ownedAdditionalInvested: 0,
    existingMortgageMonthly: 0,
    existingMortgageBalance: 0,
    existingMortgageRate: 0.065,
    existingMortgageRemainingYears: 25,
    existingTaxMonthly: 0,
    existingInsuranceMonthly: 0
  },
  commercial: {
    grossLeasableAreaSqft: 9000,
    occupiedSqft: 8100,
    averageBaseRentPerSqftYear: 28,
    nnnRecoveryPerSqftYear: 9,
    vacancyPercent: 0.06,
    creditLossPercent: 0.01,
    nonRecoverableExpensesPerSqftYear: 4,
    managementFeePercent: 0.03,
    tenantImprovementsReservePerSqftYear: 0.8,
    leasingCommissionsReservePerSqftYear: 0.7,
    annualRentGrowthPercent: 0.03,
    annualExpenseGrowthPercent: 0.025
  },
  longTerm: {
    grossRentMonthly: 0,
    otherIncomeMonthly: 0,
    annualRevenueOverride: null,
    tenantPlacementFeePercent: 0.75,
    arvOverride: null,
    vacancyPercent: 0.05,
    maintenancePercent: 0.05,
    capexPercent: 0.05,
    managementFeePercent: 0.08,
    ownerExpensesMonthly: 0,
    turnaround: {
      enabled: false,
      stabilizedGrossRentMonthly: 0,
      stabilizedOtherIncomeMonthly: 0,
      laundryIncomeMonthly: 0,
      vendingMiscIncomeMonthly: 0,
      garageIncomeMonthly: 0,
      parkingIncomeMonthly: 0,
      additionalIncomeMonthly: 0,
      rehabBudgetForStabilization: 0,
      annualTaxInsuranceAdjustment: 0,
      vacancyPercent: 0.03,
      maintenancePercent: 0.05,
      capexPercent: 0.02,
      ownerPaidExpensesMonthly: 0,
      managementFeePercent: 0.08,
      exitRefiCapRatePercent: 0.055
    }
  },
  airbnb: {
    adr: 0,
    arvOverride: null,
    annualRevenueOverride: null,
    occupancyPercent: 0.68,
    nightsPerMonth: 30.4,
    platformFeePercent: 0.14,
    cleaningFeeCharged: 125,
    cleanerCostPerTurn: 110,
    averageNightsPerBooking: 3,
    maintenancePercent: 0.05,
    capexPercent: 0.05,
    managementFeePercent: 0.18,
    ownerExpensesMonthly: 0,
    furnishingOneTime: 18000
  },
  padSplit: {
    rentableRooms: 0,
    arvOverride: null,
    annualRevenueOverride: null,
    avgWeeklyRatePerRoom: 0,
    occupancyPercent: 0.9,
    weeksPerMonth: 4.3333,
    otherIncomeMonthly: 0,
    platformFeePercent: 0.08,
    maintenancePercent: 0.05,
    capexPercent: 0.05,
    managementFeePercent: 0.06,
    turnoverCostPerMoveOut: 40,
    moveOutsPerYear: 10,
    ownerExpensesMonthly: 0,
    furnishingOneTime: 16200
  },
  brrrr: {
    holdingMonths: 6,
    holdingExpensesMonthly: 480,
    arvOverride: null,
    rehabOverride: null,
    refinanceLtvPercent: 0.75,
    refinanceRate: 0.065,
    refinanceClosingCostPercent: 0.03,
    operatingStrategy: 'longTerm'
  },
  flip: {
    holdingMonths: 6,
    arvOverride: null,
    rehabOverride: null,
    agentCommissionPercent: 0.06,
    sellClosingCostPercent: 0.02,
    sellerConcessions: 3000
  },
  variableExpenses: [
    { key: 'power', label: 'Power', monthlyAmount: 300, appliesTo: { purchase: false, longTerm: false, airbnb: true, padSplit: true, flip: true } },
    { key: 'water', label: 'Water / Sewer', monthlyAmount: 180, appliesTo: { purchase: false, longTerm: false, airbnb: true, padSplit: true, flip: true } },
    { key: 'trash', label: 'Trash', monthlyAmount: 0, appliesTo: { purchase: false, longTerm: false, airbnb: false, padSplit: false, flip: false } },
    { key: 'gas', label: 'Gas', monthlyAmount: 0, appliesTo: { purchase: false, longTerm: false, airbnb: true, padSplit: true, flip: true } },
    { key: 'internet', label: 'Internet', monthlyAmount: 75, appliesTo: { purchase: false, longTerm: false, airbnb: true, padSplit: true, flip: false } },
    { key: 'pool', label: 'Pool Service', monthlyAmount: 0, appliesTo: { purchase: false, longTerm: false, airbnb: true, padSplit: false, flip: false } },
    { key: 'lawn', label: 'Lawn Service', monthlyAmount: 120, appliesTo: { purchase: false, longTerm: false, airbnb: true, padSplit: true, flip: false } },
    { key: 'licensing', label: 'Pest Control', monthlyAmount: 0, appliesTo: { purchase: false, longTerm: false, airbnb: false, padSplit: false, flip: false } },
    { key: 'padsplit-cleaning', label: 'PadSplit Monthly Cleaning', monthlyAmount: 120, appliesTo: { purchase: false, longTerm: false, airbnb: false, padSplit: true, flip: false } },
    { key: 'other', label: 'Other', monthlyAmount: 0, appliesTo: { purchase: false, longTerm: false, airbnb: false, padSplit: false, flip: false } },
    { key: 'other-2', label: 'Other 2', monthlyAmount: 0, appliesTo: { purchase: false, longTerm: false, airbnb: false, padSplit: false, flip: false } }
  ],
  assumptions: {
    holdYears: 10,
    annualAppreciationPercent: 0.04,
    sellingCostPercent: 0.08,
    noiGrowthPercent: 0.025,
    targetIrrPercent: 0.12
  }
};
