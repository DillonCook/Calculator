export type FinancingType = 'cash' | 'loan';

export type StrategyKey = 'purchase' | 'longTerm' | 'airbnb' | 'padSplit' | 'brrrr' | 'flip';

export type ExpenseStrategyKey = 'longTerm' | 'airbnb' | 'padSplit' | 'flip';

export interface PurchaseInputs {
  dealName: string;
  purchasePrice: number;
  rehabBudget: number;
  arv: number;
  downPaymentPercent: number;
  closingCostPercent: number;
  interestRate: number;
  loanTermYears: number;
  pointsPercent: number;
  financingType: FinancingType;
  propertyTaxAnnualOverride: number | null;
  insuranceAnnualOverride: number | null;
  hoaMonthly: number;
  pmiMonthly: number;
}

export interface LongTermInputs {
  grossRentMonthly: number;
  otherIncomeMonthly: number;
  vacancyPercent: number;
  maintenancePercent: number;
  capexPercent: number;
  ownerExpensesMonthly: number;
}

export interface AirbnbInputs {
  adr: number;
  occupancyPercent: number;
  nightsPerMonth: number;
  platformFeePercent: number;
  cleaningFeeCharged: number;
  cleanerCostPerTurn: number;
  averageNightsPerBooking: number;
  ownerExpensesMonthly: number;
}

export interface PadSplitInputs {
  rentableRooms: number;
  avgWeeklyRatePerRoom: number;
  occupancyPercent: number;
  weeksPerMonth: number;
  platformFeePercent: number;
  turnoverCostMonthly: number;
  ownerExpensesMonthly: number;
  furnishingOneTime: number;
}

export interface BrrrrInputs {
  holdingMonths: number;
  holdingExpensesMonthly: number;
  refinanceLtvPercent: number;
  refinanceRate: number;
  refinanceClosingCostPercent: number;
}

export interface FlipInputs {
  holdingMonths: number;
  holdingExpensesMonthly: number;
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
}

export interface DealInputModel {
  purchase: PurchaseInputs;
  longTerm: LongTermInputs;
  airbnb: AirbnbInputs;
  padSplit: PadSplitInputs;
  brrrr: BrrrrInputs;
  flip: FlipInputs;
  variableExpenses: VariableExpenseCategory[];
  assumptions: MasterAssumptions;
}

export interface StrategyOutput {
  strategy: StrategyKey;
  monthlyCashFlow: number;
  annualCashFlow: number;
  capRate: number;
  cashOnCashReturn: number;
  roi: number;
  irr: number;
  totalCashNeeded: number;
  notes: string;
  noiMonthly?: number;
  saleProceeds?: number;
  cashFlowTimeline: number[];
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
    dealName: 'Tampa Duplex - Sample Deal',
    purchasePrice: 285000,
    rehabBudget: 25000,
    arv: 360000,
    downPaymentPercent: 0.2,
    closingCostPercent: 0.015,
    interestRate: 0.068,
    loanTermYears: 30,
    pointsPercent: 0.01,
    financingType: 'loan',
    propertyTaxAnnualOverride: null,
    insuranceAnnualOverride: null,
    hoaMonthly: 0,
    pmiMonthly: 0
  },
  longTerm: {
    grossRentMonthly: 2950,
    otherIncomeMonthly: 150,
    vacancyPercent: 0.06,
    maintenancePercent: 0.05,
    capexPercent: 0.05,
    ownerExpensesMonthly: 550
  },
  airbnb: {
    adr: 180,
    occupancyPercent: 0.68,
    nightsPerMonth: 30.4,
    platformFeePercent: 0.14,
    cleaningFeeCharged: 125,
    cleanerCostPerTurn: 110,
    averageNightsPerBooking: 3,
    ownerExpensesMonthly: 675
  },
  padSplit: {
    rentableRooms: 5,
    avgWeeklyRatePerRoom: 195,
    occupancyPercent: 0.9,
    weeksPerMonth: 4.33,
    platformFeePercent: 0.08,
    turnoverCostMonthly: 140,
    ownerExpensesMonthly: 820,
    furnishingOneTime: 16200
  },
  brrrr: {
    holdingMonths: 6,
    holdingExpensesMonthly: 480,
    refinanceLtvPercent: 0.75,
    refinanceRate: 0.065,
    refinanceClosingCostPercent: 0.03
  },
  flip: {
    holdingMonths: 6,
    holdingExpensesMonthly: 480,
    agentCommissionPercent: 0.06,
    sellClosingCostPercent: 0.02,
    sellerConcessions: 3000
  },
  variableExpenses: [
    { key: 'power', label: 'Power', monthlyAmount: 300, appliesTo: { longTerm: false, airbnb: true, padSplit: true, flip: true } },
    { key: 'water', label: 'Water / Sewer', monthlyAmount: 180, appliesTo: { longTerm: false, airbnb: true, padSplit: true, flip: true } },
    { key: 'trash', label: 'Trash', monthlyAmount: 0, appliesTo: { longTerm: false, airbnb: false, padSplit: false, flip: false } },
    { key: 'gas', label: 'Gas', monthlyAmount: 0, appliesTo: { longTerm: false, airbnb: true, padSplit: true, flip: true } },
    { key: 'internet', label: 'Internet', monthlyAmount: 75, appliesTo: { longTerm: false, airbnb: true, padSplit: true, flip: false } },
    { key: 'pool', label: 'Pool Service', monthlyAmount: 0, appliesTo: { longTerm: false, airbnb: true, padSplit: false, flip: false } },
    { key: 'lawn', label: 'Lawn Service', monthlyAmount: 120, appliesTo: { longTerm: false, airbnb: true, padSplit: true, flip: false } },
    { key: 'licensing', label: 'Licensing / Permits', monthlyAmount: 0, appliesTo: { longTerm: false, airbnb: false, padSplit: false, flip: false } },
    { key: 'padsplit-cleaning', label: 'PadSplit Monthly Cleaning', monthlyAmount: 120, appliesTo: { longTerm: false, airbnb: false, padSplit: true, flip: false } },
    { key: 'other', label: 'Other', monthlyAmount: 0, appliesTo: { longTerm: false, airbnb: false, padSplit: false, flip: false } }
  ],
  assumptions: {
    holdYears: 10,
    annualAppreciationPercent: 0.04,
    sellingCostPercent: 0.08,
    noiGrowthPercent: 0.025
  }
};
