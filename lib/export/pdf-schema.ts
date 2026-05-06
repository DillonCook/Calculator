import type { DealInputModel, DealResult, ExpenseStrategyKey, StrategyCalculationLineItem, StrategyKey, StrategyOutput } from '@/lib/models/deal';
import { currencyFormatter, percentFormatter } from '@/lib/formatters';
import { calculateCashToClose } from '@/lib/engine/finance';
import { normalizeListingUrl } from '@/lib/listing-link';
import { getFixedCostBreakdown } from '@/lib/tax-insurance';

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
  flipAnalysis?: PdfReportSection;
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

const buildFriendlySubtitle = (strategyLabel: string) =>
  `Start with Executive Summary to see cash needed and core returns for this ${strategyLabel} plan. ` +
  'Then review Performance Highlights and Assumptions to understand what is driving the numbers. ' +
  'These are projections based on your inputs, so edit your deal assumptions and regenerate anytime.';

const formatDscr = (value: number) => value.toFixed(2);
const formatCurrency = (value: number) => currencyFormatter.format(value);

const getSelectedOutput = (result: DealResult, strategy: StrategyKey): StrategyOutput => result[strategy];

const getVariableExpenseStrategy = (input: DealInputModel, selectedStrategy: StrategyKey): ExpenseStrategyKey | null => {
  if (selectedStrategy === 'purchase') return 'purchase';
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
  const flipMeta = selectedStrategy === 'flip' ? strategyOutput.calculationBreakdown?.flipMeta : undefined;
  const effectiveValue = selectedStrategy === 'flip' ? flipMeta?.netProfit ?? 0 : strategyOutput.monthlyCashFlow;
  const fixedCostBreakdown = getFixedCostBreakdown(input.purchase);
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
  const isLongTermTurnaround = selectedStrategy === 'longTerm' && Boolean(turnaroundSummary?.enabled);
  const selectedStrategyLabel = isLongTermTurnaround ? 'Long-Term Turnaround' : strategyLabels[selectedStrategy];
  const hasTurnaroundExitValueOverride = isLongTermTurnaround && input.longTerm.arvOverride !== null && input.longTerm.arvOverride > 0;
  const turnaroundInputs = input.longTerm.turnaround;
  const holdYears = Math.max(0, input.assumptions.holdYears);
  const holdYearsLabel = holdYears === 1 ? '1 year' : `${holdYears} years`;
  const flipHoldMonths = Math.max(flipMeta?.holdingMonths ?? input.flip.holdingMonths, 0);
  const flipHoldLabel = flipHoldMonths === 1 ? '1 month' : `${flipHoldMonths} months`;
  const variableExpenses = variableExpenseStrategy
    ? input.variableExpenses.filter((expense) => expense.appliesTo[variableExpenseStrategy])
    : [];

  return {
    title: 'Deal Summary',
    subtitle: buildFriendlySubtitle(selectedStrategyLabel),
    generatedAt: new Date().toISOString(),
    dealName: input.purchase.dealName,
    selectedStrategy,
    selectedStrategyLabel,
    summary: {
      title: 'Executive Summary',
      rows: [
        { label: 'Selected Strategy', value: selectedStrategyLabel },
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
        {
          label: selectedStrategy === 'flip' ? 'Net Profit' : isLongTermTurnaround ? 'Stabilized Monthly Cash Flow' : 'Monthly Cash Flow',
          value: formatCurrency(effectiveValue)
        },
        { label: isLongTermTurnaround ? 'Stabilized Annual Cash Flow' : 'Annual Cash Flow', value: formatCurrency(strategyOutput.annualCashFlow) },
        { label: isLongTermTurnaround ? 'Stabilized NOI (Monthly)' : 'NOI (Monthly)', value: formatCurrency(strategyOutput.noiMonthly ?? 0) },
        { label: 'ROI', value: percentFormatter.format(strategyOutput.roi) },
        { label: 'IRR', value: percentFormatter.format(strategyOutput.irr) },
        {
          label:
            selectedStrategy === 'flip'
              ? `Projected Sale Cash Returned (after ${flipHoldLabel})`
              : `Projected Sale Proceeds (after holding for ${holdYearsLabel})`,
          value: formatCurrency(strategyOutput.saleProceeds ?? 0)
        }
      ]
    },
    underwritingWork: {
      title: 'How These Numbers Were Calculated',
      rows: strategyOutput.calculationBreakdown ? toWorkRows(strategyOutput.calculationBreakdown.lines) : [{ label: 'Calculation lines', value: 'Not available' }]
    },
    taxAndInsuranceDetail: {
      title: 'Taxes, Insurance & Fixed Carry Costs',
      rows: [
        {
          label: 'Property Tax',
          value: `${formatCurrency(fixedCostBreakdown.propertyTaxMonthly)} /mo (${formatCurrency(fixedCostBreakdown.propertyTaxAnnual)} /yr)`
        },
        {
          label: 'Insurance',
          value: `${formatCurrency(fixedCostBreakdown.insuranceMonthly)} /mo (${formatCurrency(fixedCostBreakdown.insuranceAnnual)} /yr)`
        },
        { label: 'HOA', value: `${formatCurrency(input.purchase.hoaMonthly)} /mo (${formatCurrency(input.purchase.hoaMonthly * 12)} /yr)` },
        { label: 'PMI', value: `${formatCurrency(input.purchase.pmiMonthly)} /mo (${formatCurrency(input.purchase.pmiMonthly * 12)} /yr)` },
        {
          label: 'Total Fixed Carry',
          value: `${formatCurrency(fixedCostBreakdown.totalMonthly)} /mo`
        }
      ]
    },
    variableExpenseDetail: {
      title: `Variable Expenses (${selectedStrategyLabel})`,
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
    flipAnalysis:
      selectedStrategy === 'flip' && flipMeta
        ? {
            title: 'Flip Targets & Funding',
            rows: [
              { label: 'Max allowable offer', value: flipMeta.maxAllowableOffer === null ? 'No purchase price meets targets' : formatCurrency(flipMeta.maxAllowableOffer) },
              { label: 'Target profit', value: formatCurrency(flipMeta.targetProfit) },
              { label: 'Target ROI', value: percentFormatter.format(flipMeta.targetRoiPercent) },
              { label: 'Base rehab', value: formatCurrency(flipMeta.baseRehabBudget) },
              { label: 'Rehab contingency', value: `${percentFormatter.format(flipMeta.rehabContingencyPercent)} (${formatCurrency(flipMeta.rehabContingency)})` },
              { label: 'Total rehab', value: formatCurrency(flipMeta.rehabBudget) },
              { label: 'Hard money enabled', value: flipMeta.hardMoneyEnabled ? 'Yes' : 'No' },
              { label: 'Hard money loan amount', value: formatCurrency(flipMeta.hardMoneyLoanAmount) },
              { label: 'Hard money interest cost', value: formatCurrency(flipMeta.hardMoneyInterestCost) },
              { label: 'Points + lender fees', value: formatCurrency(flipMeta.pointsCost + flipMeta.hardMoneyOtherFees) }
            ]
          }
        : undefined,
    turnaroundStabilization:
      selectedStrategy === 'longTerm' && turnaroundSummary?.enabled
        ? {
            title: 'Turnaround Stabilization (12-Month)',
            rows: [
              { label: 'Turnaround mode', value: turnaroundInputs.enabled ? 'Enabled' : 'Disabled' },
              { label: 'Projection basis', value: 'IRR/ROI use regular long-term inputs for the first 12 months, then stabilized run-rate NOI.' },
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
              {
                label: 'Exit value basis',
                value: hasTurnaroundExitValueOverride
                  ? `Exit value override (${formatCurrency(input.longTerm.arvOverride ?? 0)})`
                  : `Implied value @ exit cap (${formatCurrency(turnaroundSummary.impliedValueAtExitCap)})`
              },
              { label: 'First-year turnaround cash flow', value: formatCurrency(turnaroundSummary.turnaroundYearCashFlowPreTax) },
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
