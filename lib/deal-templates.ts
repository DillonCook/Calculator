import { defaultDealInput, type DealInputModel } from '@/lib/models/deal';
export const SAMPLE_DEAL_NAME = 'Tampa Duplex - Sample Deal';

export const cloneDefaultDealPayload = (): DealInputModel => ({
  ...defaultDealInput,
  purchase: { ...defaultDealInput.purchase },
  commercial: { ...defaultDealInput.commercial },
  longTerm: {
    ...defaultDealInput.longTerm,
    turnaround: { ...defaultDealInput.longTerm.turnaround }
  },
  airbnb: { ...defaultDealInput.airbnb },
  padSplit: { ...defaultDealInput.padSplit },
  brrrr: { ...defaultDealInput.brrrr },
  flip: { ...defaultDealInput.flip },
  variableExpenses: defaultDealInput.variableExpenses.map((expense) => ({
    ...expense,
    appliesTo: { ...expense.appliesTo }
  })),
  assumptions: { ...defaultDealInput.assumptions }
});

export const buildNewDealPayload = (dealName: string, listingUrl = ''): DealInputModel => {
  const base = cloneDefaultDealPayload();

  return {
    ...base,
    purchase: {
      ...base.purchase,
      dealName,
      listingUrl,
      purchasePrice: 0,
      rehabBudget: 0,
      arv: 0
    },
    commercial: {
      ...base.commercial,
      averageBaseRentPerSqftYear: 0,
      nnnRecoveryPerSqftYear: 0
    },
    longTerm: {
      ...base.longTerm,
      grossRentMonthly: 0,
      turnaround: {
        ...base.longTerm.turnaround,
        stabilizedGrossRentMonthly: 0
      }
    },
    airbnb: {
      ...base.airbnb,
      adr: 0
    },
    padSplit: {
      ...base.padSplit,
      avgWeeklyRatePerRoom: 0
    }
  };
};

export const buildSampleDealPayload = (): DealInputModel => {
  const base = cloneDefaultDealPayload();

  return {
    ...base,
    analysis: {kind:'sample',assumptionsReviewed:false},
    purchase: {
      ...base.purchase,
      dealName: SAMPLE_DEAL_NAME,
      listingUrl: '',
      purchasePrice: 285000,
      rehabBudget: 25000,
      arv: 340000
    },
    commercial: {
      ...base.commercial,
      grossLeasableAreaSqft: 9000,
      occupiedSqft: 8100,
      averageBaseRentPerSqftYear: 28,
      nnnRecoveryPerSqftYear: 9
    },
    longTerm: {
      ...base.longTerm,
      grossRentMonthly: 3200,
      otherIncomeMonthly: 75,
      turnaround: {
        ...base.longTerm.turnaround,
        enabled: true,
        stabilizedGrossRentMonthly: 3600,
        additionalIncomeMonthly: 100,
        rehabBudgetForStabilization: 25000
      }
    },
    airbnb: {
      ...base.airbnb,
      adr: 185,
      occupancyPercent: 0.66
    },
    padSplit: {
      ...base.padSplit,
      rentableRooms: 5,
      avgWeeklyRatePerRoom: 215
    },
    brrrr: {
      ...base.brrrr,
      holdingMonths: 6,
      rehabOverride: 25000,
      arvOverride: 340000
    },
    flip: {
      ...base.flip,
      holdingMonths: 5,
      rehabOverride: 25000,
      arvOverride: 340000
    }
  };
};
