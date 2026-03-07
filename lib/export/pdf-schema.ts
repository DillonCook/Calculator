import type { DealInputModel, DealResult, ExpenseStrategyKey, StrategyCalculationLineItem, StrategyKey, StrategyOutput } from '@/lib/models/deal';
import { currencyFormatter, percentFormatter } from '@/lib/formatters';
import { calculateCashToClose } from '@/lib/engine/finance';
import { normalizeListingUrl } from '@/lib/listing-link';

export interface PdfReportRow {
  label: string;
  value: string;
  href?: string;
}

export interface PdfReportSection {
  title: string;
  rows: PdfReportRow[];
}

export interface PdfReportSchema {
  title: string;
  subtitle: string;
  generatedAt: string;
  dealName: string;
  selectedStrategy: StrategyKey;
  selectedStrategyLabel: string;
  summary: PdfReportSection;
  strategyHighlights: PdfReportSection;
  underwritingWork: PdfReportSection;
  taxAndInsuranceDetail: PdfReportSection;
  variableExpenseDetail: PdfReportSection;
  financingSnapshot: PdfReportSection;
  turnaroundStabilization?: PdfReportSection;
  assumptions: PdfReportSection;
  listingReference: PdfReportSection;
}

const strategyLabels: Record<StrategyKey, string> = {
  purchase: 'Commercial',
  longTerm: 'Long-Term Rental',
  airbnb: 'Airbnb / STR',
  padSplit: 'PadSplit',
  brrrr: 'BRRRR',
  flip: 'Flip'
};

const buildFriendlySubtitle = (strategy: StrategyKey) =>
  `Start with Executive Summary to see cash needed and core returns for this ${strategyLabels[strategy]} plan. ` +
  'Then review Performance Highlights and Assumptions to understand what is driving the numbers. ' +
  'These are projections based on your inputs, so edit your deal assumptions and regenerate anytime.';

const formatDscr = (value: number) => value.toFixed(2);
const formatCurrency = (value: number) => currencyFormatter.format(value);

const getSelectedOutput = (result: DealResult, strategy: StrategyKey): StrategyOutput => result[strategy];

const getVariableExpenseStrategy = (input: DealInputModel, selectedStrategy: StrategyKey): ExpenseStrategyKey | null => {
  if (selectedStrategy === 'purchase') return null;
  if (selectedStrategy === 'brrrr') return input.brrrr.operatingStrategy;
  return selectedStrategy as ExpenseStrategyKey;
};

const toWorkRows = (lines: StrategyCalculationLineItem[]) => {
  return lines.map((line) => ({
    label: line.label,
    value: `${formatCurrency(line.monthly)} /mo (${formatCurrency(line.annual)} /yr)`
  }));
};

export const createPdfReportSchema = (
  input: DealInputModel,
  result: DealResult,
  selectedStrategy: StrategyKey = 'longTerm'
): PdfReportSchema => {
  const strategyOutput = getSelectedOutput(result, selectedStrategy);
  const effectiveValue = selectedStrategy === 'flip' ? strategyOutput.saleProceeds ?? 0 : strategyOutput.monthlyCashFlow;
  const annualTax = input.purchase.propertyTaxAnnualOverride ?? input.purchase.purchasePrice * 0.017;
  const annualInsurance = input.purchase.insuranceAnnualOverride ?? input.purchase.purchasePrice * 0.01;
  const cashToCloseValue =
    input.purchase.ownershipMode === 'owned'
      ? Math.max(input.purchase.helocClosingCosts, 0)
      : calculateCashToClose(
          input.purchase.purchasePrice,
          0,
          input.purchase.downPaymentPercent,
          input.purchase.closingCostPercent,
          input.purchase.pointsPercent,
          input.purchase.financingType,
          input.purchase.helocAmount,
          input.purchase.helocClosingCosts
        );
  const variableExpenseStrategy = getVariableExpenseStrategy(input, selectedStrategy);
  const turnaroundSummary = selectedStrategy === 'longTerm' ? strategyOutput.longTermTurnaroundSummary : undefined;
  const turnaroundInputs = input.longTerm.turnaround;
  const holdYears = Math.max(0, input.assumptions.holdYears);
  const holdYearsLabel = holdYears === 1 ? '1 year' : `${holdYears} years`;
  const variableExpenses = variableExpenseStrategy
    ? input.variableExpenses.filter((expense) => expense.appliesTo[variableExpenseStrategy])
    : [];

  return {
    title: 'Deal Summary',
    subtitle: buildFriendlySubtitle(selectedStrategy),
    generatedAt: new Date().toISOString(),
    dealName: input.purchase.dealName,
    selectedStrategy,
    selectedStrategyLabel: strategyLabels[selectedStrategy],
    summary: {
      title: 'Executive Summary',
      rows: [
        { label: 'Selected Strategy', value: strategyLabels[selectedStrategy] },
        { label: 'Cash to Close', value: formatCurrency(cashToCloseValue) },
        { label: 'Total Cash Invested', value: formatCurrency(strategyOutput.totalCashNeeded) },
        { label: 'Cap Rate', value: percentFormatter.format(strategyOutput.capRate) },
        { label: 'Cash-on-Cash Return', value: percentFormatter.format(strategyOutput.cashOnCashReturn) },
        { label: 'DSCR', value: formatDscr(strategyOutput.dscr) }
      ]
    },
    strategyHighlights: {
      title: 'Performance Highlights',
      rows: [
        { label: selectedStrategy === 'flip' ? 'Net Sale Proceeds' : 'Monthly Cash Flow', value: formatCurrency(effectiveValue) },
        { label: 'Annual Cash Flow', value: formatCurrency(strategyOutput.annualCashFlow) },
        { label: 'NOI (Monthly)', value: formatCurrency(strategyOutput.noiMonthly ?? 0) },
        { label: 'ROI', value: percentFormatter.format(strategyOutput.roi) },
        { label: 'IRR', value: percentFormatter.format(strategyOutput.irr) },
        { label: `Projected Sale Proceeds (after holding for ${holdYearsLabel})`, value: formatCurrency(strategyOutput.saleProceeds ?? 0) }
      ]
    },
    underwritingWork: {
      title: 'How These Numbers Were Calculated',
      rows: strategyOutput.calculationBreakdown ? toWorkRows(strategyOutput.calculationBreakdown.lines) : [{ label: 'Calculation lines', value: 'Not available' }]
    },
    taxAndInsuranceDetail: {
      title: 'Taxes, Insurance & Fixed Carry Costs',
      rows: [
        { label: 'Property Tax', value: `${formatCurrency(annualTax / 12)} /mo (${formatCurrency(annualTax)} /yr)` },
        { label: 'Insurance', value: `${formatCurrency(annualInsurance / 12)} /mo (${formatCurrency(annualInsurance)} /yr)` },
        { label: 'HOA', value: `${formatCurrency(input.purchase.hoaMonthly)} /mo (${formatCurrency(input.purchase.hoaMonthly * 12)} /yr)` },
        { label: 'PMI', value: `${formatCurrency(input.purchase.pmiMonthly)} /mo (${formatCurrency(input.purchase.pmiMonthly * 12)} /yr)` },
        {
          label: 'Total Fixed Carry',
          value: `${formatCurrency(annualTax / 12 + annualInsurance / 12 + input.purchase.hoaMonthly + input.purchase.pmiMonthly)} /mo`
        }
      ]
    },
    variableExpenseDetail: {
      title: `Variable Expenses (${strategyLabels[selectedStrategy]})`,
      rows:
        variableExpenses.length > 0
          ? [
              ...variableExpenses.map((expense) => ({
                label: expense.label,
                value: `${formatCurrency(expense.monthlyAmount)} /mo (${formatCurrency(expense.monthlyAmount * 12)} /yr)`
              })),
              {
                label: 'Total Variable Expenses',
                value: `${formatCurrency(variableExpenses.reduce((sum, expense) => sum + expense.monthlyAmount, 0))} /mo`
              }
            ]
          : [{ label: 'Variable expenses', value: 'None configured for this strategy' }]
    },
    financingSnapshot: {
      title: 'Financing Snapshot',
      rows: [
        { label: 'Purchase Price', value: formatCurrency(input.purchase.purchasePrice) },
        { label: 'Rehab Budget', value: formatCurrency(input.purchase.rehabBudget) },
        { label: 'Loan Type', value: input.purchase.financingType === 'cash' ? 'Cash Purchase' : 'Financed' },
        { label: 'Interest Rate', value: percentFormatter.format(input.purchase.interestRate) },
        { label: 'Loan Term', value: `${input.purchase.loanTermYears} years` },
        { label: 'Points', value: percentFormatter.format(input.purchase.pointsPercent) }
      ]
    },
    turnaroundStabilization:
      selectedStrategy === 'longTerm' && turnaroundSummary?.enabled
        ? {
            title: 'Turnaround Stabilization (12-Month)',
            rows: [
              { label: 'Turnaround mode', value: turnaroundInputs.enabled ? 'Enabled' : 'Disabled' },
              { label: 'Stabilized gross rent (monthly)', value: formatCurrency(turnaroundInputs.stabilizedGrossRentMonthly) },
              { label: 'Stabilized other income (monthly)', value: formatCurrency(turnaroundInputs.stabilizedOtherIncomeMonthly) },
              { label: 'Laundry + vending + garage + parking + option (monthly)', value: formatCurrency(
                turnaroundInputs.laundryIncomeMonthly +
                  turnaroundInputs.vendingMiscIncomeMonthly +
                  turnaroundInputs.garageIncomeMonthly +
                  turnaroundInputs.parkingIncomeMonthly +
                  turnaroundInputs.additionalIncomeMonthly
              ) },
              { label: 'Rehab budget for stabilization', value: formatCurrency(turnaroundInputs.rehabBudgetForStabilization) },
              { label: 'Tax/insurance adjustment (annual)', value: formatCurrency(turnaroundInputs.annualTaxInsuranceAdjustment) },
              { label: 'Stabilized vacancy %', value: percentFormatter.format(turnaroundInputs.vacancyPercent) },
              { label: 'Stabilized maintenance %', value: percentFormatter.format(turnaroundInputs.maintenancePercent) },
              { label: 'Stabilized CapEx %', value: percentFormatter.format(turnaroundInputs.capexPercent) },
              { label: 'PM fee %', value: percentFormatter.format(turnaroundInputs.managementFeePercent) },
              { label: 'Exit/Refi cap rate %', value: percentFormatter.format(turnaroundInputs.exitRefiCapRatePercent) },
              { label: 'NOI (stabilized)', value: formatCurrency(turnaroundSummary.noiMonthly) },
              { label: 'Cash flow (pre-tax)', value: formatCurrency(turnaroundSummary.cashFlowPreTaxMonthly) },
              { label: 'Cash flow excluding reserves', value: formatCurrency(turnaroundSummary.cashFlowExcludingReservesMonthly) },
              { label: 'Total cash invested', value: formatCurrency(turnaroundSummary.totalCashInvested) },
              { label: 'DSCR (stabilized)', value: formatDscr(turnaroundSummary.dscr) },
              { label: 'Cap rate (stabilized)', value: percentFormatter.format(turnaroundSummary.capRate) },
              { label: 'Cash-on-cash (stabilized)', value: percentFormatter.format(turnaroundSummary.cashOnCashReturn) },
              { label: 'IRR (stabilized)', value: percentFormatter.format(turnaroundSummary.irr) },
              { label: 'ROI (stabilized)', value: percentFormatter.format(turnaroundSummary.roi) },
              { label: 'Implied value @ exit cap', value: formatCurrency(turnaroundSummary.impliedValueAtExitCap) },
              { label: 'Cap on cost', value: percentFormatter.format(turnaroundSummary.capOnCost) },
              { label: 'Equity created', value: formatCurrency(turnaroundSummary.equityCreated) }
            ]
          }
        : undefined,
    assumptions: {
      title: 'Market Assumptions',
      rows: [
        { label: 'Hold Period', value: `${input.assumptions.holdYears} years` },
        { label: 'NOI Growth', value: percentFormatter.format(input.assumptions.noiGrowthPercent) },
        { label: 'Appreciation', value: percentFormatter.format(input.assumptions.annualAppreciationPercent) },
        { label: 'Selling Cost', value: percentFormatter.format(input.assumptions.sellingCostPercent) }
      ]
    },

    listingReference: {
      title: 'Listing Reference',
      rows: [
        {
          label: 'Source URL',
          value: input.purchase.listingUrl || 'Not provided',
          href: input.purchase.listingUrl ? normalizeListingUrl(input.purchase.listingUrl) : undefined
        }
      ]
    },
  };
};
