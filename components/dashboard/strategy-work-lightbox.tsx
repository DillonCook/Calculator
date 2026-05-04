'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { DealInputModel, ExpenseStrategyKey, StrategyCalculationLineItem, StrategyKey, StrategyOutput } from '@/lib/models/deal';
import { currencyFormatter } from '@/lib/formatters';
import { getNegativeValueStyle } from '@/lib/negative-value-color';
import { MobileSheet } from '@/components/dashboard/mobile-sheet';
import { useFloatingTooltipPosition } from '@/lib/use-floating-tooltip-position';
import { getFixedCostBreakdown } from '@/lib/tax-insurance';

const strategyLabels: Record<StrategyKey, string> = {
  purchase: 'Commercial',
  longTerm: 'Long-Term',
  airbnb: 'Airbnb / STR',
  padSplit: 'PadSplit',
  brrrr: 'BRRRR',
  flip: 'Flip'
};

const brrrrOperatingLabels = {
  longTerm: 'Long-Term',
  airbnb: 'Airbnb / STR',
  padSplit: 'PadSplit'
} as const;

interface StrategyWorkLightboxProps {
  open: boolean;
  activeStrategy: StrategyKey;
  output: StrategyOutput;
  input: DealInputModel;
  onClose: () => void;
  presentation?: 'modal' | 'sheet';
}

type WorkBreakdownGroupKey = 'income' | 'expenses' | 'debtService' | 'result';

interface WorkBreakdownGroup {
  key: WorkBreakdownGroupKey;
  title: string;
  caption: string;
  lines: StrategyCalculationLineItem[];
  totalMonthly: number;
  totalAnnual: number;
}

const Row = ({ line }: { line: StrategyCalculationLineItem }) => (
  <div className="section-inner grid grid-cols-1 gap-1.5 rounded-lg px-3 py-2 text-xs sm:grid-cols-[1.2fr_1fr_1fr] sm:gap-2 sm:text-sm">
    <p className="text-slate-100">{line.label}</p>
    <p
      className={`text-left sm:text-right ${line.monthly >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
      style={getNegativeValueStyle(line.monthly, { kind: 'currency' })}
    >
      Monthly: {currencyFormatter.format(line.monthly)}
    </p>
    <p
      className={`text-left sm:text-right ${line.annual >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
      style={getNegativeValueStyle(line.annual, { kind: 'currency' })}
    >
      Annual: {currencyFormatter.format(line.annual)}
    </p>
  </div>
);

const formatFormulaMoney = (value: number) => (value < 0 ? `(${currencyFormatter.format(value)})` : currencyFormatter.format(value));

const isResultLine = (line: StrategyCalculationLineItem) => /(^|[-\s])(noi|cash flow|net profit)([-\s]|$)/i.test(line.key) || /\bnoi\b|cash flow|net profit/i.test(line.label);

const isDebtLine = (line: StrategyCalculationLineItem) => /debt-service|lender/i.test(line.key) || /debt service|lender costs/i.test(line.label);

const isExpenseLine = (line: StrategyCalculationLineItem) =>
  /fixed-costs|owner-expenses|variable-costs|variable-expenses|vacancy|maintenance|capex|management|turnover|placement|reserve|closing|concessions|tax|insurance|hoa|pmi/i.test(
    `${line.key} ${line.label}`
  );

const isIncomeLine = (line: StrategyCalculationLineItem) =>
  /rent|income|revenue|recovery|reimbursements|base-rent|room-revenue|gross/i.test(`${line.key} ${line.label}`);

const isVariableExpenseLine = (line: StrategyCalculationLineItem) => /variable-costs|variable-expenses/i.test(`${line.key} ${line.label}`);

const getLineDirection = (line: StrategyCalculationLineItem) => {
  if (line.monthly !== 0) return line.monthly;
  if (line.annual !== 0) return line.annual;
  return 0;
};

const hasMeaningfulAmount = (line: StrategyCalculationLineItem) => Math.abs(line.monthly) > 0.005 || Math.abs(line.annual) > 0.005;

const buildFixedCostLineItems = (input: DealInputModel) => {
  const { purchase } = input;
  const fixedItems: StrategyCalculationLineItem[] = [];
  const maybePushFixedItem = (key: string, label: string, monthlyAmount: number) => {
    if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) return;
    fixedItems.push({
      key,
      label,
      monthly: -monthlyAmount,
      annual: -(monthlyAmount * 12)
    });
  };

  if (purchase.ownershipMode === 'owned') {
    maybePushFixedItem('existing-tax', 'Property tax', purchase.existingTaxMonthly);
    maybePushFixedItem('existing-insurance', 'Insurance', purchase.existingInsuranceMonthly);
  } else {
    const fixedCostBreakdown = getFixedCostBreakdown(purchase);
    maybePushFixedItem('property-tax', 'Property tax', fixedCostBreakdown.propertyTaxMonthly);
    maybePushFixedItem('property-insurance', 'Insurance', fixedCostBreakdown.insuranceMonthly);
  }

  maybePushFixedItem('hoa', 'HOA', purchase.hoaMonthly);
  maybePushFixedItem('pmi', 'PMI', purchase.pmiMonthly);

  return fixedItems;
};

const buildVariableExpenseLineItems = (input: DealInputModel, activeStrategy: StrategyKey) => {
  const supportedStrategies: StrategyKey[] = ['purchase', 'longTerm', 'airbnb', 'padSplit', 'flip'];
  if (!supportedStrategies.includes(activeStrategy)) return [];

  const expenseStrategy = activeStrategy as ExpenseStrategyKey;

  return input.variableExpenses
    .filter((expense) => expense.appliesTo[expenseStrategy] && Number.isFinite(expense.monthlyAmount) && expense.monthlyAmount > 0)
    .map((expense, index) => {
      const label = expense.label.trim() || `Variable expense ${index + 1}`;
      return {
        key: `variable-expense-${expense.key}`,
        label,
        monthly: -expense.monthlyAmount,
        annual: -(expense.monthlyAmount * 12)
      };
    });
};

const expandWorkBreakdownLines = (lines: StrategyCalculationLineItem[], input: DealInputModel, activeStrategy: StrategyKey) => {
  const fixedCostLines = buildFixedCostLineItems(input);
  const variableExpenseLines = buildVariableExpenseLineItems(input, activeStrategy);

  return lines.flatMap((line) => {
    if (isVariableExpenseLine(line)) {
      return variableExpenseLines.length > 0 ? variableExpenseLines : hasMeaningfulAmount(line) ? [line] : [];
    }

    if (!/fixed-costs/i.test(line.key) && !/fixed costs/i.test(line.label)) {
      return hasMeaningfulAmount(line) ? [line] : [];
    }

    return fixedCostLines.length > 0 ? fixedCostLines : hasMeaningfulAmount(line) ? [line] : [];
  });
};

const buildWorkBreakdownGroups = (lines: StrategyCalculationLineItem[], input: DealInputModel, activeStrategy: StrategyKey): WorkBreakdownGroup[] => {
  const groups: Record<WorkBreakdownGroupKey, WorkBreakdownGroup> = {
    income: {
      key: 'income',
      title: 'Income',
      caption: 'Rent, reimbursements, and other inflows.',
      lines: [],
      totalMonthly: 0,
      totalAnnual: 0
    },
    expenses: {
      key: 'expenses',
      title: 'Expenses',
      caption: 'Owner-paid costs, reserves, and variable expenses.',
      lines: [],
      totalMonthly: 0,
      totalAnnual: 0
    },
    debtService: {
      key: 'debtService',
      title: 'Debt service',
      caption: 'Loan payments and lender carrying costs.',
      lines: [],
      totalMonthly: 0,
      totalAnnual: 0
    },
    result: {
      key: 'result',
      title: 'Result',
      caption: 'The rolled-up NOI and cash-flow outcome.',
      lines: [],
      totalMonthly: 0,
      totalAnnual: 0
    }
  };

  const normalizedLines = expandWorkBreakdownLines(lines, input, activeStrategy);

  normalizedLines.forEach((line) => {
    let groupKey: WorkBreakdownGroupKey;
    if (isResultLine(line)) {
      groupKey = 'result';
    } else if (isDebtLine(line)) {
      groupKey = 'debtService';
    } else if (isExpenseLine(line)) {
      groupKey = 'expenses';
    } else if (isIncomeLine(line)) {
      groupKey = 'income';
    } else if (getLineDirection(line) < 0) {
      groupKey = 'expenses';
    } else {
      groupKey = 'income';
    }

    groups[groupKey].lines.push(line);
    groups[groupKey].totalMonthly += line.monthly;
    groups[groupKey].totalAnnual += line.annual;
  });

  if (groups.income.lines.length === 0) {
    const noiFallbackLines = groups.result.lines.filter((line) => /\bnoi\b/i.test(line.label));
    if (noiFallbackLines.length > 0) {
      groups.result.lines = groups.result.lines.filter((line) => !noiFallbackLines.includes(line));
      noiFallbackLines.forEach((line) => {
        groups.income.lines.push(line);
        groups.income.totalMonthly += line.monthly;
        groups.income.totalAnnual += line.annual;
        groups.result.totalMonthly -= line.monthly;
        groups.result.totalAnnual -= line.annual;
      });
    }
  }

  return (Object.keys(groups) as WorkBreakdownGroupKey[]).map((key) => groups[key]).filter((group) => group.lines.length > 0);
};

const BreakdownSummaryCard = ({
  label,
  monthlyValue,
  annualValue,
  emphasizeAsCost = false,
  tooltip
}: {
  label: string;
  monthlyValue: number;
  annualValue: number;
  emphasizeAsCost?: boolean;
  tooltip?: ReactNode;
}) => {
  const valueStyle = emphasizeAsCost
    ? getNegativeValueStyle(-Math.abs(monthlyValue), { kind: 'currency' })
    : getNegativeValueStyle(monthlyValue, { kind: 'currency' });

  return (
    <div className="section-inner rounded-xl p-3">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
        <p>{label}</p>
        {tooltip ? <SummaryCardTooltip label={label}>{tooltip}</SummaryCardTooltip> : null}
      </div>
      <p
        className={`mt-1 text-lg font-semibold ${emphasizeAsCost ? 'text-slate-200' : monthlyValue >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
        style={valueStyle}
      >
        {currencyFormatter.format(monthlyValue)}/mo
      </p>
      <p className="mt-1 text-[11px] text-muted">{currencyFormatter.format(annualValue)}/yr</p>
    </div>
  );
};

const SummaryCardTooltip = ({ label, children }: { label: string; children: ReactNode }) => {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const tooltipAnchorRef = useRef<HTMLSpanElement | null>(null);
  const tooltipButtonRef = useRef<HTMLButtonElement | null>(null);
  const tooltipPanelRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const { style: tooltipStyle } = useFloatingTooltipPosition({
    open: isTooltipOpen,
    anchorRef: tooltipButtonRef,
    tooltipRef: tooltipPanelRef,
    preferredPlacement: 'bottom',
    maxWidth: 300,
    offset: 8,
    zIndex: 190
  });

  const clearCloseTimer = () => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const openTooltip = () => {
    clearCloseTimer();
    setIsTooltipOpen(true);
  };

  const scheduleCloseTooltip = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setIsTooltipOpen(false);
      closeTimerRef.current = null;
    }, 90);
  };

  useEffect(() => {
    if (!isTooltipOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (tooltipAnchorRef.current?.contains(target)) return;
      if (tooltipPanelRef.current?.contains(target)) return;
      setIsTooltipOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsTooltipOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTooltipOpen]);

  useEffect(
    () => () => {
      clearCloseTimer();
    },
    []
  );

  return (
    <span ref={tooltipAnchorRef} className="relative inline-flex items-center normal-case tracking-normal">
      <button
        ref={tooltipButtonRef}
        type="button"
        aria-label={`More info about ${label}`}
        className="info-trigger inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold"
        onMouseEnter={openTooltip}
        onMouseLeave={scheduleCloseTooltip}
        onFocus={openTooltip}
        onBlur={scheduleCloseTooltip}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          clearCloseTimer();
          setIsTooltipOpen((prev) => !prev);
        }}
      >
        i
      </button>
      {isTooltipOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={tooltipPanelRef}
              role="dialog"
              aria-modal="false"
              className="tooltip-surface rounded-md p-2 text-[11px] leading-relaxed"
              style={tooltipStyle}
              onMouseEnter={openTooltip}
              onMouseLeave={scheduleCloseTooltip}
            >
              {children}
            </div>,
            document.body
          )
        : null}
    </span>
  );
};

const BreakdownGroupSection = ({ group }: { group: WorkBreakdownGroup }) => {
  const totalMonthlyDisplay = group.key === 'income' || group.key === 'result' ? group.totalMonthly : Math.abs(group.totalMonthly);
  const totalAnnualDisplay = group.key === 'income' || group.key === 'result' ? group.totalAnnual : Math.abs(group.totalAnnual);

  return (
    <section className="section-inner rounded-xl p-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{group.title}</p>
          <p className="mt-1 text-[11px] text-muted">{group.caption}</p>
        </div>
        <div className="text-right text-[11px] text-muted">
          <p>{currencyFormatter.format(totalMonthlyDisplay)}/mo</p>
          <p>{currencyFormatter.format(totalAnnualDisplay)}/yr</p>
        </div>
      </div>

      <div className="space-y-2">
        {group.lines.map((line) => (
          <Row key={line.key} line={line} />
        ))}
      </div>
    </section>
  );
};

const buildDerivedGroup = (
  group: WorkBreakdownGroup | undefined,
  title: string,
  caption: string,
  lines: StrategyCalculationLineItem[]
): WorkBreakdownGroup | null => {
  if (!group || lines.length === 0) return null;

  return {
    ...group,
    title,
    caption,
    lines,
    totalMonthly: lines.reduce((sum, line) => sum + line.monthly, 0),
    totalAnnual: lines.reduce((sum, line) => sum + line.annual, 0)
  };
};

const TooltipLineList = ({ lines }: { lines: StrategyCalculationLineItem[] }) => (
  <div className="space-y-1.5">
    {lines.map((line) => (
      <div key={line.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <span className="min-w-0 text-slate-200">{line.label}</span>
        <span className="text-right text-slate-100">{currencyFormatter.format(Math.abs(line.monthly))}/mo</span>
      </div>
    ))}
  </div>
);

const BrrrrFinancials = ({ breakdown, output }: { breakdown: NonNullable<StrategyOutput['calculationBreakdown']>; output: StrategyOutput }) => {
  const meta = breakdown.brrrrMeta;

  if (!meta) return null;

  const holdingMonths = Math.max(meta.holdingMonths, 0);
  const cashInBeforeHolding =
    meta.purchaseCashComponent +
    meta.buyClosingCosts +
    meta.pointsCost +
    meta.rehabBudget +
    meta.setupCostOneTime +
    meta.helocClosingCosts -
    meta.helocOffset;
  const monthlyHoldingTotal =
    meta.monthlyHoldingExpenses + meta.fixedHoldingCostsMonthly + meta.variableHoldingCostsMonthly + meta.lenderHoldingCostsMonthly;

  const upfrontRows = [
    { key: 'purchase-cash', label: 'Purchase cash in', amount: meta.purchaseCashComponent, tone: 'neutral' as const },
    { key: 'buy-closing', label: 'Buy closing costs', amount: meta.buyClosingCosts, tone: 'neutral' as const },
    { key: 'points', label: 'Loan points', amount: meta.pointsCost, tone: 'neutral' as const },
    { key: 'rehab', label: 'Rehab budget', amount: meta.rehabBudget, tone: 'neutral' as const },
    { key: 'setup', label: 'One-time setup costs', amount: meta.setupCostOneTime, tone: 'neutral' as const },
    { key: 'heloc-offset', label: 'HELOC draw offset', amount: meta.helocOffset, tone: 'offset' as const },
    { key: 'heloc-close', label: 'HELOC closing costs', amount: meta.helocClosingCosts, tone: 'neutral' as const }
  ].filter((item) => item.amount > 0);

  const holdingRows = [
    { key: 'monthly-hold', label: 'Monthly holding expenses', monthly: meta.monthlyHoldingExpenses, total: meta.monthlyHoldingExpenses * holdingMonths },
    { key: 'fixed-hold', label: 'Fixed carrying costs', monthly: meta.fixedHoldingCostsMonthly, total: meta.fixedHoldingCostsMonthly * holdingMonths },
    { key: 'variable-hold', label: 'Variable expenses', monthly: meta.variableHoldingCostsMonthly, total: meta.variableHoldingCostsMonthly * holdingMonths },
    { key: 'lender-hold', label: 'First-loan carrying costs', monthly: meta.lenderHoldingCostsMonthly, total: meta.lenderHoldingCostsMonthly * holdingMonths }
  ].filter((item) => item.monthly > 0 || item.total > 0);

  return (
    <div className="space-y-3">
      <div className="section-inner grid gap-2 rounded-xl p-3 sm:grid-cols-2 xl:grid-cols-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Invested at purchase</p>
          <p className="text-lg font-semibold text-slate-100">{currencyFormatter.format(meta.investedAtPurchase)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Cash back at refi</p>
          <p
            className={`text-lg font-semibold ${meta.cashBackAtRefiNet >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
            style={getNegativeValueStyle(meta.cashBackAtRefiNet, { kind: 'currency' })}
          >
            {currencyFormatter.format(meta.cashBackAtRefiNet)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Cash left in deal</p>
          <p
            className={`text-lg font-semibold ${meta.investedAfterRefi <= 0 ? 'text-emerald-300' : 'text-slate-100'}`}
            style={meta.investedAfterRefi <= 0 ? getNegativeValueStyle(-meta.investedAfterRefi, { kind: 'currency' }) : undefined}
          >
            {currencyFormatter.format(meta.investedAfterRefi)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Post-refi ops model</p>
          <p className="text-lg font-semibold text-slate-100">{brrrrOperatingLabels[meta.operatingStrategy]}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Post-refi NOI</p>
          <p
            className={`text-lg font-semibold ${meta.selectedOperatingNoi >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
            style={getNegativeValueStyle(meta.selectedOperatingNoi, { kind: 'currency' })}
          >
            {currencyFormatter.format(meta.selectedOperatingNoi)}/mo
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Cash flow after refi</p>
          <p
            className={`text-lg font-semibold ${output.monthlyCashFlow >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
            style={getNegativeValueStyle(output.monthlyCashFlow, { kind: 'currency' })}
          >
            {currencyFormatter.format(output.monthlyCashFlow)}/mo
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="section-inner space-y-2 rounded-xl p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Cash invested before refi</p>
          {upfrontRows.length === 0 ? (
            <p className="text-sm text-muted">No upfront BRRRR capital items beyond holding costs.</p>
          ) : (
            upfrontRows.map((item) => (
              <div key={item.key} className="grid grid-cols-[1fr_auto] gap-2 text-sm">
                <p className="text-slate-100">{item.label}</p>
                <p
                  className={`text-right ${item.tone === 'offset' ? 'text-emerald-300' : 'text-slate-100'}`}
                  style={item.tone === 'offset' ? getNegativeValueStyle(item.amount, { kind: 'currency' }) : undefined}
                >
                  {item.tone === 'offset' ? '-' : ''}
                  {currencyFormatter.format(item.amount)}
                </p>
              </div>
            ))
          )}
          <div className="mt-1 grid grid-cols-[1fr_auto] gap-2 border-t border-white/10 pt-2 text-sm">
            <p className="text-slate-100">Cash in before holding</p>
            <p className="text-right font-semibold text-slate-100">{currencyFormatter.format(cashInBeforeHolding)}</p>
          </div>
        </div>

        <div className="section-inner space-y-2 rounded-xl p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Holding costs ({holdingMonths} mo)</p>
          {holdingRows.length === 0 ? (
            <p className="text-sm text-muted">No modeled holding costs before refi.</p>
          ) : (
            holdingRows.map((item) => (
              <div key={item.key} className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm">
                <p className="text-slate-100">{item.label}</p>
                <p className="text-right text-muted">{currencyFormatter.format(item.monthly)}/mo</p>
                <p className="text-right text-slate-100">{currencyFormatter.format(item.total)}</p>
              </div>
            ))
          )}
          <div className="mt-1 grid grid-cols-[1fr_auto_auto] gap-2 border-t border-white/10 pt-2 text-sm">
            <p className="text-slate-100">Holding costs total</p>
            <p className="text-right text-muted">{currencyFormatter.format(monthlyHoldingTotal)}/mo</p>
            <p className="text-right font-semibold text-slate-100">{currencyFormatter.format(meta.holdingCostsTotal)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="section-inner space-y-2 rounded-xl p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Refi math</p>
          <div className="grid grid-cols-[1fr_auto] gap-2 text-sm">
            <p className="text-slate-100">BRRRR ARV</p>
            <p className="text-right text-slate-100">{currencyFormatter.format(meta.arvAtRefi)}</p>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 text-sm">
            <p className="text-slate-100">Refi loan amount</p>
            <p className="text-right text-slate-100">{currencyFormatter.format(meta.refiLoanAmount)}</p>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 text-sm">
            <p className="text-slate-100">Refi closing costs</p>
            <p className="text-right text-slate-100">{currencyFormatter.format(meta.refiClosingCosts)}</p>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 text-sm">
            <p className="text-slate-100">First-loan payoff</p>
            <p className="text-right text-slate-100">{currencyFormatter.format(meta.initialLoanPayoff)}</p>
          </div>
          <div className="mt-1 grid grid-cols-[1fr_auto] gap-2 border-t border-white/10 pt-2 text-sm">
            <p className="text-slate-100">Cash back at refi</p>
            <p
              className={`text-right font-semibold ${meta.cashBackAtRefiNet >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
              style={getNegativeValueStyle(meta.cashBackAtRefiNet, { kind: 'currency' })}
            >
              {currencyFormatter.format(meta.cashBackAtRefiNet)}
            </p>
          </div>
          {meta.arvAtRefi <= 0 ? (
            <p className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
              No BRRRR ARV entered yet. Refi proceeds are zero, so cash back currently only reflects the first-loan payoff.
            </p>
          ) : null}
        </div>

        <div className="section-inner space-y-2 rounded-xl p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Post-refi operating math</p>
          <div className="grid grid-cols-[1fr_auto] gap-2 text-sm">
            <p className="text-slate-100">Operating model</p>
            <p className="text-right text-slate-100">{brrrrOperatingLabels[meta.operatingStrategy]}</p>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 text-sm">
            <p className="text-slate-100">Selected NOI</p>
            <p
              className={`text-right ${meta.selectedOperatingNoi >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
              style={getNegativeValueStyle(meta.selectedOperatingNoi, { kind: 'currency' })}
            >
              {currencyFormatter.format(meta.selectedOperatingNoi)}/mo
            </p>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 text-sm">
            <p className="text-slate-100">Refi debt service</p>
            <p className="text-right text-slate-100">{currencyFormatter.format(meta.refinanceDebt)}/mo</p>
          </div>
          <div className="mt-1 grid grid-cols-[1fr_auto] gap-2 border-t border-white/10 pt-2 text-sm">
            <p className="text-slate-100">Cash flow</p>
            <p
              className={`text-right font-semibold ${output.monthlyCashFlow >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
              style={getNegativeValueStyle(output.monthlyCashFlow, { kind: 'currency' })}
            >
              {currencyFormatter.format(output.monthlyCashFlow)}/mo
            </p>
          </div>
        </div>
      </div>

      <div className="section-inner rounded-xl p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Cash left in deal formula</p>
        <p className="mt-1 text-sm text-slate-200">
          {formatFormulaMoney(meta.investedAtPurchase)} - {formatFormulaMoney(meta.cashBackAtRefiNet)} ={' '}
          <span
            className={`font-semibold ${meta.investedAfterRefi <= 0 ? 'text-emerald-300' : 'text-slate-100'}`}
            style={meta.investedAfterRefi <= 0 ? getNegativeValueStyle(-meta.investedAfterRefi, { kind: 'currency' }) : undefined}
          >
            {formatFormulaMoney(meta.investedAfterRefi)}
          </span>
        </p>
      </div>
    </div>
  );
};


const FlipFinancials = ({ breakdown }: { breakdown: NonNullable<StrategyOutput['calculationBreakdown']> }) => {
  const meta = breakdown.flipMeta;

  if (!meta) return null;

  const holdingMonths = Math.max(meta.holdingMonths, 1);

  const costItems = [
    { key: 'purchase', label: 'Purchase price', total: meta.purchasePrice },
    { key: 'rehab', label: 'Rehab budget', total: meta.rehabBudget },
    { key: 'buy-close', label: 'Buy closing costs', total: meta.buyClosingCosts },
    { key: 'agent', label: 'Agent commission', total: meta.agentCommission },
    { key: 'sell-close', label: 'Sell closing costs', total: meta.sellClosingCosts },
    { key: 'concessions', label: 'Seller concessions', total: meta.sellerConcessions }
  ];

  const holdingItems = [
    { key: 'fixed', label: 'Fixed holding costs', monthly: meta.fixedHoldingCostsMonthly, total: meta.fixedHoldingCostsMonthly * holdingMonths },
    { key: 'variable', label: 'Variable expenses', monthly: meta.variableHoldingCostsMonthly, total: meta.variableHoldingCostsMonthly * holdingMonths },
    { key: 'lender', label: 'Lender costs (debt service)', monthly: meta.lenderHoldingCostsMonthly, total: meta.lenderHoldingCostsMonthly * holdingMonths }
  ];

  const totalCosts = costItems.reduce((sum, item) => sum + item.total, 0) + meta.holdingCostsTotal;

  return (
    <div className="space-y-3"> 
      <div className="section-inner grid gap-2 rounded-xl p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Sale price</p>
          <p className="text-lg font-semibold text-emerald-300">{currencyFormatter.format(meta.salePrice)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Total costs</p>
          <p className="text-lg font-semibold text-slate-200" style={getNegativeValueStyle(-totalCosts, { kind: 'currency' })}>
            -{currencyFormatter.format(totalCosts)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Holding period</p>
          <p className="text-lg font-semibold text-slate-100">{holdingMonths} mo</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted">Net profit</p>
          <p
            className={`text-lg font-semibold ${meta.netProfit >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
            style={getNegativeValueStyle(meta.netProfit, { kind: 'currency' })}
          >
            {currencyFormatter.format(meta.netProfit)}
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="section-inner space-y-2 rounded-xl p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">One-time costs</p>
          {costItems.map((item) => (
            <div key={item.key} className="grid grid-cols-[1fr_auto] gap-2 text-sm">
              <p className="text-slate-100">{item.label}</p>
              <p className="text-right text-slate-200" style={getNegativeValueStyle(-item.total, { kind: 'currency' })}>
                -{currencyFormatter.format(item.total)}
              </p>
            </div>
          ))}
        </div>

        <div className="section-inner space-y-2 rounded-xl p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Holding costs ({holdingMonths} mo)</p>
          {holdingItems.map((item) => (
            <div key={item.key} className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm">
              <p className="text-slate-100">{item.label}</p>
              <p className="text-right text-muted">{currencyFormatter.format(item.monthly)}/mo</p>
              <p className="text-right text-slate-200" style={getNegativeValueStyle(-item.total, { kind: 'currency' })}>
                -{currencyFormatter.format(item.total)}
              </p>
            </div>
          ))}
          <div className="mt-1 grid grid-cols-[1fr_auto_auto] gap-2 border-t border-white/10 pt-2 text-sm">
            <p className="text-slate-100">Holding costs total</p>
            <p className="text-right text-muted">{currencyFormatter.format(meta.holdingCostsTotal / holdingMonths)}/mo</p>
            <p
              className="text-right font-semibold text-slate-200"
              style={getNegativeValueStyle(-meta.holdingCostsTotal, { kind: 'currency' })}
            >
              -{currencyFormatter.format(meta.holdingCostsTotal)}
            </p>
          </div>
        </div>
      </div>

      <div className="section-inner rounded-xl p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Net profit formula</p>
        <p className="mt-1 text-sm text-slate-200">
          {currencyFormatter.format(meta.salePrice)} - {currencyFormatter.format(totalCosts)} ={' '}
          <span
            className={`font-semibold ${meta.netProfit >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
            style={getNegativeValueStyle(meta.netProfit, { kind: 'currency' })}
          >
            {currencyFormatter.format(meta.netProfit)}
          </span>
        </p>
      </div>
    </div>
  );
};

export function StrategyWorkLightbox({
  open,
  activeStrategy,
  output,
  input,
  onClose,
  presentation = 'modal'
}: StrategyWorkLightboxProps) {
  if (!open) return null;

  const breakdown = output.calculationBreakdown;
  const groupedBreakdown = breakdown ? buildWorkBreakdownGroups(breakdown.lines, input, activeStrategy) : [];
  const incomeGroup = groupedBreakdown.find((group) => group.key === 'income');
  const expenseGroup = groupedBreakdown.find((group) => group.key === 'expenses');
  const debtGroup = groupedBreakdown.find((group) => group.key === 'debtService');
  const variableExpenseLines = expenseGroup?.lines.filter(isVariableExpenseLine) ?? [];
  const coreExpenseLines = expenseGroup?.lines.filter((line) => !isVariableExpenseLine(line)) ?? [];
  const incomeDetailGroup = buildDerivedGroup(incomeGroup, 'Income', 'Revenue and other inflows feeding the property.', incomeGroup?.lines ?? []);
  const coreExpenseDetailGroup = buildDerivedGroup(
    expenseGroup,
    'Expenses',
    'Taxes, insurance, owner-paid costs, and recurring operating expenses.',
    coreExpenseLines
  );
  const variableExpenseDetailGroup = buildDerivedGroup(
    expenseGroup,
    'Variable expenses',
    'Custom expense lines assigned to this strategy.',
    variableExpenseLines
  );
  const hasLeftDetailColumn = Boolean(incomeDetailGroup || variableExpenseDetailGroup);
  const monthlyOutOfPocket = Math.max(-output.monthlyCashFlow, 0);
  const annualOutOfPocket = monthlyOutOfPocket * 12;
  const monthlySurplus = Math.max(output.monthlyCashFlow, 0);
  const annualSurplus = monthlySurplus * 12;
  const monthlyIncomeTotal = Math.max(incomeGroup?.totalMonthly ?? 0, 0);
  const monthlyExpenseTotal = Math.abs(expenseGroup?.totalMonthly ?? 0);
  const monthlyDebtTotal = Math.abs(debtGroup?.totalMonthly ?? 0);
  const content = (
    <>
      {!breakdown ? (
        <p className="section-inner rounded-lg p-3 text-sm text-muted">No breakdown available for this strategy yet.</p>
      ) : (
        <div className="space-y-3">
          {activeStrategy === 'brrrr' && breakdown.brrrrMeta ? (
            <BrrrrFinancials breakdown={breakdown} output={output} />
          ) : activeStrategy === 'flip' && breakdown.flipMeta ? (
            <FlipFinancials breakdown={breakdown} />
          ) : (
            <div className="space-y-3">
              <div className="section-inner grid gap-2 rounded-xl p-3 sm:grid-cols-2 xl:grid-cols-4">
                <BreakdownSummaryCard
                  label="Income"
                  monthlyValue={Math.max(incomeGroup?.totalMonthly ?? 0, 0)}
                  annualValue={Math.max(incomeGroup?.totalAnnual ?? 0, 0)}
                />
                <BreakdownSummaryCard
                  label="Expenses"
                  monthlyValue={Math.abs(expenseGroup?.totalMonthly ?? 0)}
                  annualValue={Math.abs(expenseGroup?.totalAnnual ?? 0)}
                  emphasizeAsCost
                  tooltip={
                    expenseGroup?.lines?.length ? (
                      <div className="space-y-2">
                        <p className="font-semibold text-white">Monthly operating expenses</p>
                        <TooltipLineList lines={expenseGroup.lines} />
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t border-white/10 pt-2">
                          <span className="text-slate-300">Total</span>
                          <span className="text-slate-100">{currencyFormatter.format(monthlyExpenseTotal)}/mo</span>
                        </div>
                      </div>
                    ) : (
                      'No operating expense lines are currently modeled.'
                    )
                  }
                />
                <BreakdownSummaryCard
                  label="Debt service"
                  monthlyValue={Math.abs(debtGroup?.totalMonthly ?? 0)}
                  annualValue={Math.abs(debtGroup?.totalAnnual ?? 0)}
                  emphasizeAsCost
                />
                <BreakdownSummaryCard
                  label={monthlyOutOfPocket > 0 ? 'Out of pocket' : 'Monthly surplus'}
                  monthlyValue={monthlyOutOfPocket > 0 ? monthlyOutOfPocket : monthlySurplus}
                  annualValue={monthlyOutOfPocket > 0 ? annualOutOfPocket : annualSurplus}
                  emphasizeAsCost={monthlyOutOfPocket > 0}
                  tooltip={
                    monthlyOutOfPocket > 0 ? (
                      <div className="space-y-2">
                        <p className="font-semibold text-white">Out-of-pocket math</p>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                          <span className="text-slate-300">Income</span>
                          <span className="text-slate-100">{currencyFormatter.format(monthlyIncomeTotal)}/mo</span>
                          <span className="text-slate-300">Expenses</span>
                          <span className="text-slate-100">-{currencyFormatter.format(monthlyExpenseTotal)}/mo</span>
                          <span className="text-slate-300">Debt service</span>
                          <span className="text-slate-100">-{currencyFormatter.format(monthlyDebtTotal)}/mo</span>
                        </div>
                        <div className="border-t border-white/10 pt-2 text-slate-200">
                          {currencyFormatter.format(monthlyIncomeTotal)} - {currencyFormatter.format(monthlyExpenseTotal)} - {currencyFormatter.format(monthlyDebtTotal)} ={' '}
                          <span className="font-semibold text-white">-{currencyFormatter.format(monthlyOutOfPocket)}/mo</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="font-semibold text-white">Monthly surplus math</p>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                          <span className="text-slate-300">Income</span>
                          <span className="text-slate-100">{currencyFormatter.format(monthlyIncomeTotal)}/mo</span>
                          <span className="text-slate-300">Expenses</span>
                          <span className="text-slate-100">-{currencyFormatter.format(monthlyExpenseTotal)}/mo</span>
                          <span className="text-slate-300">Debt service</span>
                          <span className="text-slate-100">-{currencyFormatter.format(monthlyDebtTotal)}/mo</span>
                        </div>
                        <div className="border-t border-white/10 pt-2 text-slate-200">
                          {currencyFormatter.format(monthlyIncomeTotal)} - {currencyFormatter.format(monthlyExpenseTotal)} - {currencyFormatter.format(monthlyDebtTotal)} ={' '}
                          <span className="font-semibold text-white">{currencyFormatter.format(monthlySurplus)}/mo</span>
                        </div>
                      </div>
                    )
                  }
                />
              </div>

              {monthlyOutOfPocket > 0 ? (
                <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
                  You are covering <span className="font-semibold">{currencyFormatter.format(monthlyOutOfPocket)}/mo</span> out of pocket after income, operating expenses, and debt service.
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                  The model clears all expenses and debt service with <span className="font-semibold">{currencyFormatter.format(monthlySurplus)}/mo</span> left over.
                </div>
              )}

              <div className={hasLeftDetailColumn && coreExpenseDetailGroup ? 'grid gap-3 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] xl:items-start' : 'space-y-3'}>
                {hasLeftDetailColumn ? (
                  <div className="space-y-3 self-start">
                    {incomeDetailGroup ? <BreakdownGroupSection group={incomeDetailGroup} /> : null}
                    {variableExpenseDetailGroup ? <BreakdownGroupSection group={variableExpenseDetailGroup} /> : null}
                  </div>
                ) : null}
                {coreExpenseDetailGroup ? <BreakdownGroupSection group={coreExpenseDetailGroup} /> : null}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  if (presentation === 'sheet') {
    return (
      <MobileSheet open={open} title={`${strategyLabels[activeStrategy]} calculations`} onClose={onClose}>
        <div className="mobile-sheet-stack space-y-4">
          <div>
            <p className="section-eyebrow-analysis text-xs uppercase tracking-wider">Show your work</p>
            <h3 className="mt-1 text-lg font-semibold">{strategyLabels[activeStrategy]} calculations</h3>
            <p className="mt-1 text-sm text-muted">
              Line-item math behind each strategy&apos;s outcome, including dedicated BRRRR capital and flip profit breakdowns.
            </p>
          </div>
          {content}
        </div>
      </MobileSheet>
    );
  }

  return (
    <div className="lightbox-backdrop fixed inset-0 z-[190] flex items-center justify-center p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Strategy Work Lightbox">
      <div className="section-shell section-shell-analysis max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl p-5 shadow-soft">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="section-eyebrow-analysis text-xs uppercase tracking-wider">Show your work</p>
            <h3 className="text-xl font-semibold">{strategyLabels[activeStrategy]} calculations</h3>
            <p className="text-sm text-muted">Line-item math behind each strategy&apos;s outcome, including dedicated BRRRR capital and flip profit breakdowns.</p>
          </div>
          <button type="button" onClick={onClose} className="section-action section-action-analysis rounded-lg px-3 py-1.5 text-xs text-muted">
            Close
          </button>
        </div>

        {content}
      </div>
    </div>
  );
}

