import type { DealInputModel, DealResult, StrategyKey } from '@/lib/models/deal';

export interface PdfReportSection {
  title: string;
  rows: { label: string; value: string }[];
}

export interface PdfReportSchema {
  title: string;
  generatedAt: string;
  dealName: string;
  assumptions: PdfReportSection;
  summary: PdfReportSection;
  strategySections: PdfReportSection[];
}

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 });

const strategyLabels: Record<Exclude<StrategyKey, 'purchase'>, string> = {
  longTerm: 'Long-Term Rental',
  airbnb: 'Airbnb / STR',
  padSplit: 'PadSplit',
  brrrr: 'BRRRR',
  flip: 'Flip'
};

export const createPdfReportSchema = (input: DealInputModel, result: DealResult): PdfReportSchema => {
  const strategySections = (Object.keys(strategyLabels) as (keyof typeof strategyLabels)[]).map((key) => {
    const row = result[key];

    return {
      title: strategyLabels[key],
      rows: [
        { label: 'Monthly Cash Flow', value: currency.format(row.monthlyCashFlow) },
        { label: 'Annual Cash Flow', value: currency.format(row.annualCashFlow) },
        { label: 'Cash-on-Cash Return', value: percent.format(row.cashOnCashReturn) },
        { label: 'ROI', value: percent.format(row.roi) },
        { label: 'IRR', value: percent.format(row.irr) },
        { label: 'Sale Proceeds (Hold End)', value: currency.format(row.saleProceeds ?? 0) }
      ]
    };
  });

  return {
    title: 'Investor Command Center - Deal Report',
    generatedAt: new Date().toISOString(),
    dealName: input.purchase.dealName,
    assumptions: {
      title: 'Master Assumptions',
      rows: [
        { label: 'Hold Period', value: `${input.assumptions.holdYears} years` },
        { label: 'NOI Growth', value: percent.format(input.assumptions.noiGrowthPercent) },
        { label: 'Appreciation', value: percent.format(input.assumptions.annualAppreciationPercent) },
        { label: 'Selling Cost', value: percent.format(input.assumptions.sellingCostPercent) }
      ]
    },
    summary: {
      title: 'Master Summary',
      rows: [
        { label: 'Cash to Close', value: currency.format(result.masterSummary.cashToClose) },
        { label: 'Best Monthly Cash Flow', value: currency.format(result.masterSummary.monthlyCashFlow) },
        { label: 'Best Cash-on-Cash Return', value: percent.format(result.masterSummary.cashOnCashReturn) },
        { label: 'Best ROI', value: percent.format(result.masterSummary.roi) },
        { label: 'Best IRR', value: percent.format(result.masterSummary.irr) }
      ]
    },
    strategySections
  };
};
