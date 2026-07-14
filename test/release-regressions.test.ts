import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateDeal } from '../lib/engine/deal-engine';
import { createPdfReportSchema } from '../lib/export/pdf-schema';
import { getAnnualOperatingCashFlows, getModeledSaleCashAtMonth, getProjectionMetrics, getTotalCashInvested } from '../lib/projection-metrics';
import { defaultDealInput } from '../lib/models/deal';

const near = (actual: number, expected: number, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const model = () => {
  const input = structuredClone(defaultDealInput);
  input.variableExpenses = [];
  Object.assign(input.purchase, { propertyTaxAnnualOverride: 0, insuranceAnnualOverride: 0, hoaMonthly: 0, pmiMonthly: 0, closingCostPercent: 0, pointsPercent: 0, rehabBudget: 0 });
  Object.assign(input.longTerm, { grossRentMonthly: 0, otherIncomeMonthly: 0, vacancyPercent: 0, maintenancePercent: 0, capexPercent: 0, managementFeePercent: 0, ownerExpensesMonthly: 0 });
  Object.assign(input.assumptions, { annualAppreciationPercent: 0, sellingCostPercent: 0, noiGrowthPercent: 0 });
  return input;
};

test('payment-only owned mortgage remains in event returns', () => {
  const input = model();
  Object.assign(input.purchase, { ownershipMode: 'owned', financingType: 'cash', purchasePrice: 0, arv: 20000, ownedPurchasePrice: 20000, ownedMoneyDown: 20000, ownedAdditionalInvested: 0, existingMortgageBalance: 0, existingMortgageMonthly: 1000, existingMortgageRate: 0.04, existingMortgageRemainingYears: 15 });
  Object.assign(input.purchase, { interestRate: 0.075, loanTermYears: 30, pointsPercent: 0.01 });
  input.assumptions.holdYears = 1;
  const output = calculateDeal(input).longTerm;
  const metrics = getProjectionMetrics(output, 1, input);
  const operating = (output.cashFlowEvents ?? []).filter((event) => event.category === 'operating').reduce((sum, event) => sum + event.amount, 0);
  near(operating, -12000);
  near(output.roi, -0.375);
  near(metrics.totalInvested, 32000);
  near(metrics.modeledProfit, -12000);
  assert.equal(metrics.paybackMonths, null);
  const report = createPdfReportSchema(input, calculateDeal(input), 'longTerm');
  const financing = Object.fromEntries(report.financingSnapshot.rows.map((row) => [row.label, row.value]));
  assert.equal(financing['Original Purchase Price'], '$20,000');
  assert.equal(financing['Loan Type'], 'Existing mortgage');
  assert.equal(financing['Interest Rate'], '4.00%');
  assert.equal(financing['Loan Term'], '15 years remaining');
  assert.equal(financing.Points, 'N/A');
});

test('zero-LTV BRRRR does not resurrect paid acquisition debt', () => {
  const input = model();
  Object.assign(input.purchase, { financingType: 'loan', purchasePrice: 100000, arv: 100000, downPaymentPercent: 0.2, interestRate: 0, loanTermYears: 30 });
  Object.assign(input.brrrr, { arvOverride: 100000, rehabOverride: 0, holdingMonths: 6, holdingExpensesMonthly: 0, refinanceLtvPercent: 0, refinanceClosingCostPercent: 0 });
  Object.assign(input.assumptions, { holdYears: 2, annualAppreciationPercent: 0.2, sellingCostPercent: 0.05 });
  const output = calculateDeal(input).brrrr;
  const metrics = getProjectionMetrics(output, 2, input);
  near(getModeledSaleCashAtMonth(output, input, 24), output.saleProceeds ?? 0);
  near(metrics.modeledProfit, (output.cashFlowEvents ?? []).reduce((sum, event) => sum + event.amount, 0));
  near(getTotalCashInvested(output), metrics.totalInvested);
  near(
    getAnnualOperatingCashFlows(output, 2).reduce((sum, value) => sum + value, 0),
    (output.cashFlowEvents ?? []).reduce((sum, event) => sum + (event.category === 'operating' ? event.amount : 0), 0)
  );
  assert.ok(metrics.paybackMonths !== null && metrics.paybackMonths <= 24);
});

test('Turnaround implied-cap exit is shared by engine and payback', () => {
  const input = model();
  Object.assign(input.purchase, { financingType: 'cash', purchasePrice: 150000, arv: 150000 });
  Object.assign(input.longTerm.turnaround, { enabled: true, stabilizedGrossRentMonthly: 1000, stabilizedOtherIncomeMonthly: 0, vacancyPercent: 0, maintenancePercent: 0, capexPercent: 0, managementFeePercent: 0, ownerPaidExpensesMonthly: 0, rehabBudgetForStabilization: 0, exitRefiCapRatePercent: 0.06, stabilizedArvOverride: null });
  Object.assign(input.assumptions, { holdYears: 2, sellingCostPercent: 0.1 });
  const output = calculateDeal(input).longTerm;
  near(output.longTermTurnaroundSummary?.modeledExitValue ?? 0, 200000);
  near(output.saleProceeds ?? 0, 180000);
  near(getModeledSaleCashAtMonth(output, input, 11), 135000);
  near(getModeledSaleCashAtMonth(output, input, 12), 180000);
  near(getModeledSaleCashAtMonth(output, input, 24), 180000);
  near(getProjectionMetrics(output, 2, input).paybackMonths ?? Number.NaN, 12);
  const report = createPdfReportSchema(input, calculateDeal(input), 'longTerm');
  const summaryInvested = report.summary.rows.find((row) => row.label === 'Total Cash Invested')?.value;
  const turnaroundInvested = report.turnaroundStabilization?.rows.find((row) => row.label === 'Total cash invested')?.value;
  assert.equal(turnaroundInvested, summaryInvested);
});
