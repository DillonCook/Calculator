export type FinancingType = 'cash' | 'loan';
export type AmortizationType = 'principalInterest' | 'interestOnly';

export type StrategyKey = 'purchase' | 'longTerm' | 'airbnb' | 'padSplit' | 'brrrr' | 'flip';

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
  amortizationType: AmortizationType;
  includePmi: boolean;
  hoaMonthly: number;
}

export interface LongTermInputs {
  grossRentMonthly: number;
  otherIncomeMonthly: number;
  vacancyPercent: number;
  maintenancePercent: number;
  capexPercent: number;
  managementFeePercent: number;
  ownerExpensesMonthly: number;
}

export interface AirbnbInputs {
  adr: number;
  occupancyPercent: number;
  nightsPerMonth: number;
  platformFeePercent: number;
  managementFeePercent: number;
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
  managementFeePercent: number;
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
  dscr: number;
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
    amortizationType: 'principalInterest',
    includePmi: false,
    hoaMonthly: 0
  },
  longTerm: {
    grossRentMonthly: 2950,
    otherIncomeMonthly: 150,
    vacancyPercent: 0.06,
    maintenancePercent: 0.05,
    capexPercent: 0.05,
    managementFeePercent: 0.08,
    ownerExpensesMonthly: 550
  },
  airbnb: {
    adr: 180,
    occupancyPercent: 0.68,
    nightsPerMonth: 30.4,
    platformFeePercent: 0.14,
    managementFeePercent: 0.18,
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
    managementFeePercent: 0.1,
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
  assumptions: {
    holdYears: 10,
    annualAppreciationPercent: 0.04,
    sellingCostPercent: 0.08,
    noiGrowthPercent: 0.025
  }
};

export const normalizeDealInput = (input: DealInputModel): DealInputModel => {
  return {
    ...input,
    purchase: {
      ...input.purchase,
      amortizationType: input.purchase.amortizationType ?? defaultDealInput.purchase.amortizationType,
      includePmi: input.purchase.includePmi ?? defaultDealInput.purchase.includePmi,
      hoaMonthly: input.purchase.hoaMonthly ?? defaultDealInput.purchase.hoaMonthly
    },
    longTerm: {
      ...input.longTerm,
      managementFeePercent:
        input.longTerm.managementFeePercent ?? defaultDealInput.longTerm.managementFeePercent
    },
    airbnb: {
      ...input.airbnb,
      managementFeePercent: input.airbnb.managementFeePercent ?? defaultDealInput.airbnb.managementFeePercent
    },
    padSplit: {
      ...input.padSplit,
      managementFeePercent:
        input.padSplit.managementFeePercent ?? defaultDealInput.padSplit.managementFeePercent
    }
  };
};
