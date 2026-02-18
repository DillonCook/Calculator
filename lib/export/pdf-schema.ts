import type { DealInputModel, DealResult, StrategyKey } from '@/lib/models/deal';
import { currencyFormatter, percentFormatter } from '@/lib/formatters';

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
        { label: 'Monthly Cash Flow', value: currencyFormatter.format(row.monthlyCashFlow) },
        { label: 'Annual Cash Flow', value: currencyFormatter.format(row.annualCashFlow) },
        { label: 'Cash-on-Cash Return', value: percentFormatter.format(row.cashOnCashReturn) },
        { label: 'ROI', value: percentFormatter.format(row.roi) },
        { label: 'IRR', value: percentFormatter.format(row.irr) },
        { label: 'Sale Proceeds (Hold End)', value: currencyFormatter.format(row.saleProceeds ?? 0) }
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
        { label: 'NOI Growth', value: percentFormatter.format(input.assumptions.noiGrowthPercent) },
        { label: 'Appreciation', value: percentFormatter.format(input.assumptions.annualAppreciationPercent) },
        { label: 'Selling Cost', value: percentFormatter.format(input.assumptions.sellingCostPercent) }
      ]
    },
    summary: {
      title: 'Master Summary',
      rows: [
        { label: 'Cash to Close', value: currencyFormatter.format(result.masterSummary.cashToClose) },
        { label: 'Best Monthly Cash Flow', value: currencyFormatter.format(result.masterSummary.monthlyCashFlow) },
        { label: 'Best Cash-on-Cash Return', value: percentFormatter.format(result.masterSummary.cashOnCashReturn) },
        { label: 'Best ROI', value: percentFormatter.format(result.masterSummary.roi) },
        { label: 'Best IRR', value: percentFormatter.format(result.masterSummary.irr) }
      ]
    },
    strategySections
  };
};
