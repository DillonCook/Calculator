'use client';

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { DealInputModel, DealResult, StrategyKey } from '@/lib/models/deal';
import { currencyFormatter, percentFormatter } from '@/lib/formatters';
import { getNegativeValueStyle } from '@/lib/negative-value-color';
import { getProjectionMetrics } from '@/lib/projection-metrics';
import { useFloatingTooltipPosition } from '@/lib/use-floating-tooltip-position';

const strategyLabels: Record<StrategyKey, string> = {
  purchase: 'Commercial',
  longTerm: 'Long-Term Rental',
  airbnb: 'Airbnb / STR',
  padSplit: 'PadSplit',
  brrrr: 'BRRRR',
  flip: 'Flip'
};
const strategyOrder: StrategyKey[] = ['purchase', 'longTerm', 'airbnb', 'padSplit', 'brrrr', 'flip'];

interface StrategyComparisonProps {
  data: DealResult;
  input: DealInputModel;
  holdYears: number;
  defaultBoardOpen?: boolean;
  inlineModelingViews?: boolean;
  lockBoardOpen?: boolean;
  hideHeader?: boolean;
  visibleStrategies?: StrategyKey[];
  onToggleVisibleStrategy?: (strategy: StrategyKey) => void;
}

export function StrategyComparison({
  data,
  input,
  holdYears,
  defaultBoardOpen = true,
  inlineModelingViews = false,
  lockBoardOpen = false,
  hideHeader = false,
  visibleStrategies,
  onToggleVisibleStrategy
}: StrategyComparisonProps) {
  const [activeModal, setActiveModal] = useState<'equity' | 'cashflow' | null>(null);
  const [isBoardOpen, setIsBoardOpen] = useState(lockBoardOpen ? true : defaultBoardOpen);
  const rows = useMemo(() => {
    const selectedStrategies =
      visibleStrategies && visibleStrategies.length > 0
        ? strategyOrder.filter((strategy) => visibleStrategies.includes(strategy))
        : strategyOrder;

    return selectedStrategies.map((strategy) => ({
      key: strategy,
      label: strategyLabels[strategy]
    }));
  }, [visibleStrategies]);
  const maxCashFlowMagnitude = Math.max(...rows.map((row) => Math.abs(data[row.key].monthlyCashFlow)), 1);

  useEffect(() => {
    setIsBoardOpen(lockBoardOpen ? true : defaultBoardOpen);
  }, [defaultBoardOpen, lockBoardOpen]);

  useEffect(() => {
    if (!inlineModelingViews) return;
    setActiveModal(null);
  }, [inlineModelingViews]);

  const equityRows = useMemo(() => {
    return rows.map((row) => {
      const output = data[row.key];
      const projectionMetrics = getProjectionMetrics(output, holdYears, input);

      return {
        key: row.key,
        label: row.label,
        ...projectionMetrics
      };
    });
  }, [data, holdYears, input, rows]);

  const maxModeledReturn = Math.max(...equityRows.map((row) => Math.max(row.modeledTotalReturn, row.totalInvested, 1)));

  const cashFlowRows = useMemo(() => {
    return rows.map((row) => {
      const output = data[row.key];
      const projectionMetrics = getProjectionMetrics(output, holdYears, input);
      const points = output.cashFlowTimeline.map((value, index) => ({ year: index, value }));
      const cashFlowOnlyPoints = points.slice(1).map((point, index, array) => ({
        ...point,
        value: index === array.length - 1 ? point.value - projectionMetrics.exitCashReturned : point.value
      }));
      const chartPoints = cashFlowOnlyPoints.length > 0 ? cashFlowOnlyPoints : points.slice(0, 1);
      const operatingMaxAbs = Math.max(...chartPoints.map((point) => Math.abs(point.value)), 1);

      return {
        key: row.key,
        label: row.label,
        points,
        chartPoints,
        operatingMaxAbs,
      };
    });
  }, [data, holdYears, input, rows]);

  const inlineComparisonCards = (
    <div className="space-y-2 sm:space-y-3">
      {rows.map((row, index) => {
        const output = data[row.key];
        const equityRow = equityRows.find((entry) => entry.key === row.key);
        const cashFlowRow = cashFlowRows.find((entry) => entry.key === row.key);
        if (!equityRow || !cashFlowRow) return null;

        const barWidth = Math.min((Math.abs(output.monthlyCashFlow) / maxCashFlowMagnitude) * 100, 100);
        const isPositive = output.monthlyCashFlow >= 0;

        return (
          <article
            key={`inline-compare-${row.key}`}
            aria-label={`${row.label} projection card`}
            className="projection-card-glass panel-swap section-shell section-shell-projection relative overflow-hidden rounded-[1.15rem] p-2.5 shadow-soft sm:rounded-[1.4rem] sm:p-5"
            style={{ animationDelay: `${80 + index * 42}ms` }}
          >
            <div className="relative z-10 space-y-2 sm:space-y-4">
              <section className="dashboard-block rounded-[0.95rem] p-2.5 sm:rounded-[1.15rem] sm:p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
                  <div className="min-w-0">
                    <p className="dashboard-kicker text-accent/90">{row.label}</p>
                    <p
                      className={`mt-1 text-2xl font-semibold leading-none tracking-tight sm:mt-2 sm:text-[2rem] ${isPositive ? 'text-emerald-300' : 'text-slate-100'}`}
                      style={getNegativeValueStyle(output.monthlyCashFlow, { kind: 'currency' })}
                    >
                      {currencyFormatter.format(output.monthlyCashFlow)}
                    </p>
                    <p className="mt-1 text-xs text-muted">Monthly operating result</p>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-[10px] sm:gap-2 sm:text-[11px]">
                    <span className="dashboard-pill">
                      IRR {percentFormatter.format(output.irr)}
                    </span>
                    <span className="dashboard-pill">
                      DSCR {output.dscr.toFixed(2)}
                    </span>
                    <span className="dashboard-pill">
                      Hold {formatHoldLabel(equityRow.holdMonths)}
                    </span>
                  </div>
                </div>

                <div className="mt-2 sm:mt-3">
                  <div className="dashboard-meta mb-1.5 flex items-center justify-between gap-2 text-[10px]">
                    <span>Cash-flow strength</span>
                    <span>{isPositive ? 'Positive carry' : 'Negative carry'}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10 sm:h-2.5">
                    <div
                      className={`h-full rounded-full ${isPositive ? 'bg-emerald-400' : 'bg-rose-400'}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:mt-3 sm:gap-2 xl:grid-cols-4">
                  <CompactMetric
                    label="CoC"
                    value={percentFormatter.format(output.cashOnCashReturn)}
                    toneStyle={getNegativeValueStyle(output.cashOnCashReturn, { kind: 'percent' })}
                  />
                  <CompactMetric
                    label="ROI"
                    value={percentFormatter.format(output.roi)}
                    toneStyle={getNegativeValueStyle(output.roi, { kind: 'percent' })}
                  />
                  <CompactMetric
                    label="Cap"
                    value={percentFormatter.format(output.capRate)}
                    toneStyle={getNegativeValueStyle(output.capRate, { kind: 'percent' })}
                  />
                  <CompactMetric label="Cash to Close" value={currencyFormatter.format(data.masterSummary.cashToClose)} />
                  <CompactMetric
                    label="Break-even"
                    value={formatBreakEvenLabel(equityRow.paybackMonths)}
                    toneStyle={equityRow.paybackMonths !== null ? { color: '#86efac' } : { color: '#fde68a' }}
                    tooltip="Break-even if selling accounts for the drag from selling costs, not just the cash you invested."
                  />
                  <CompactMetric label="Equity mult." value={`${equityRow.modeledMultiple.toFixed(2)}x`} />
                  <CompactMetric label="Exit Cash" value={currencyFormatter.format(equityRow.exitCashReturned)} />
                  <CompactMetric label="Debt svc / mo" value={currencyFormatter.format(output.calculationBreakdown?.debtServiceMonthly ?? 0)} />
                </div>
              </section>

              <div className="grid gap-2 sm:gap-3 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <section className="dashboard-block rounded-[0.95rem] p-2.5 sm:rounded-[1.1rem] sm:p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="dashboard-kicker text-[10px]">Equity</p>
                      <p
                        className={`mt-1 text-sm font-semibold ${equityRow.modeledProfit >= 0 ? 'text-emerald-300' : 'text-rose-200'}`}
                        style={getNegativeValueStyle(equityRow.modeledProfit, { kind: 'currency' })}
                      >
                        {equityRow.modeledProfit >= 0 ? '+' : ''}
                        {currencyFormatter.format(equityRow.modeledProfit)} modeled profit
                      </p>
                    </div>
                    <div className="dashboard-meta text-right text-[10px]">
                      <p>{currencyFormatter.format(equityRow.exitCashReturned)} {equityRow.exitLabel.toLowerCase()}</p>
                      <p>{formatHoldLabel(equityRow.holdMonths)}</p>
                    </div>
                  </div>

                  <div className="mt-2 space-y-2 sm:mt-3 sm:space-y-2.5">
                    <ModelBar label="Total Invested" value={equityRow.totalInvested} max={maxModeledReturn} tone="invested" compact />
                    <ModelBar
                      label="Modeled Exit"
                      value={equityRow.modeledTotalReturn}
                      max={maxModeledReturn}
                      tone={equityRow.modeledTotalReturn >= equityRow.totalInvested ? 'equity' : 'warning'}
                      compact
                    />
                  </div>
                </section>

                <section className="dashboard-block rounded-[0.95rem] p-2.5 sm:rounded-[1.1rem] sm:p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <p className="dashboard-kicker text-[10px]">Cash flow trend</p>
                      <p className="dashboard-meta mt-1 text-[10px]">Operating cash flow only.</p>
                    </div>
                    <p className="dashboard-meta text-[10px]">Scale {currencyFormatter.format(cashFlowRow.operatingMaxAbs)}</p>
                  </div>
                  <CashFlowGraph points={cashFlowRow.chartPoints} compact />
                </section>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );

  const showInlineHeader = inlineModelingViews && Boolean(onToggleVisibleStrategy);

  const boardContent = (
    <div className="space-y-3">
      {!inlineModelingViews ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveModal('equity')}
            className="tap-feedback section-action section-action-analysis rounded-lg px-3 py-1.5 text-xs font-medium text-accent"
          >
            Equity modeling
          </button>
          <button
            type="button"
            onClick={() => setActiveModal('cashflow')}
            className="tap-feedback section-action section-action-projection rounded-lg px-3 py-1.5 text-xs font-medium section-eyebrow-projection"
          >
            Cash flow modeling
          </button>
        </div>
      ) : null}

      {rows.map((row) => {
        const output = data[row.key];
        const barWidth = Math.min((Math.abs(output.monthlyCashFlow) / maxCashFlowMagnitude) * 100, 100);
        const isPositive = output.monthlyCashFlow >= 0;

        return (
          <div
            key={row.key}
            className="dashboard-block rounded-xl p-3"
          >
            <div className="mb-2 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0 text-sm font-medium">{row.label}</p>
              <p
                className={`text-sm font-semibold sm:text-base ${isPositive ? 'text-emerald-300' : 'text-slate-200'}`}
                style={getNegativeValueStyle(output.monthlyCashFlow, { kind: 'currency' })}
              >
                {currencyFormatter.format(output.monthlyCashFlow)}
                <span className="ml-1 text-xs text-muted">/mo</span>
              </p>
            </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${isPositive ? 'bg-emerald-400' : 'bg-rose-400'}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
            <div className="dashboard-meta mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs sm:grid-cols-5">
              <span className="text-center">
                CoC <span style={getNegativeValueStyle(output.cashOnCashReturn, { kind: 'percent' })}>{percentFormatter.format(output.cashOnCashReturn)}</span>
              </span>
              <span className="text-center">
                ROI <span style={getNegativeValueStyle(output.roi, { kind: 'percent' })}>{percentFormatter.format(output.roi)}</span>
              </span>
              <span className="text-center">
                DSCR
                <span
                  className={`ml-1 inline-flex rounded-full px-1.5 py-0.5 font-semibold ${
                    output.dscr < 1
                      ? 'bg-red-500/20 ring-1 ring-red-500/40'
                      : output.dscr > 1
                        ? 'bg-emerald-500/15 ring-1 ring-emerald-400/35'
                        : 'bg-white/10 text-slate-100'
                  }`}
                  style={getNegativeValueStyle(output.dscr, { kind: 'ratio', baseline: 1 })}
                >
                  {output.dscr.toFixed(2)}
                  {output.dscr < 1 ? ' \u26a0' : ''}
                </span>
              </span>
              <span className="text-center">
                IRR <span style={getNegativeValueStyle(output.irr, { kind: 'percent' })}>{percentFormatter.format(output.irr)}</span>
              </span>
              <span className="text-center">
                Cap <span style={getNegativeValueStyle(output.capRate, { kind: 'percent' })}>{percentFormatter.format(output.capRate)}</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );

  const equityModelingContent = (
    <div className="grid gap-3 sm:grid-cols-2">
      {equityRows.map((row) => (
        <div key={row.key} className="dashboard-block rounded-xl p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{row.label}</p>
            <p
              className={`text-xs font-medium ${row.modeledProfit >= 0 ? 'text-emerald-300' : 'text-red-200'}`}
              style={getNegativeValueStyle(row.modeledProfit, { kind: 'currency' })}
            >
              {row.modeledProfit >= 0 ? '+' : ''}
              {currencyFormatter.format(row.modeledProfit)} modeled profit
            </p>
          </div>

          <div className="space-y-2">
            <ModelBar label="Total Invested" value={row.totalInvested} max={maxModeledReturn} tone="invested" />
            <ModelBar
              label="Modeled Exit"
              value={row.modeledTotalReturn}
              max={maxModeledReturn}
              tone={row.modeledTotalReturn >= row.totalInvested ? 'equity' : 'warning'}
            />
          </div>

          <div className="dashboard-meta mt-3 grid grid-cols-2 gap-2 text-xs">
            <p>
              Cash to close <span className="ml-1 text-white">{currencyFormatter.format(data.masterSummary.cashToClose)}</span>
            </p>
            <p>
              {row.exitLabel} <span className="ml-1 text-white">{currencyFormatter.format(row.exitCashReturned)}</span>
            </p>
            <p>
              Equity mult. <span className="ml-1 text-white">{row.modeledMultiple.toFixed(2)}x</span>
            </p>
            <p>
              Hold <span className="ml-1 text-white">{formatHoldLabel(row.holdMonths)}</span>
            </p>
            <p>
              Break-even if selling
              <span className={`ml-1 ${row.paybackMonths !== null ? 'text-emerald-300' : 'text-amber-300'}`}>
                {formatBreakEvenLabel(row.paybackMonths)}
              </span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );

  const cashFlowModelingContent = (
    <div className="grid gap-3 sm:grid-cols-2">
      {cashFlowRows.map((row) => (
        <div key={row.key} className="dashboard-block rounded-xl p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{row.label}</p>
            <p className="dashboard-meta text-xs">Operating scale: {currencyFormatter.format(row.operatingMaxAbs)}</p>
          </div>
          <CashFlowGraph points={row.chartPoints} />
        </div>
      ))}
    </div>
  );

  return (
    <>
      <section aria-label="Strategy comparison board" className="projection-board-glass section-shell section-shell-projection min-w-0 max-w-full overflow-hidden rounded-2xl p-3 shadow-soft sm:p-5">
        {inlineModelingViews ? (
          showInlineHeader ? (
            <div className="dashboard-block mb-4 rounded-[1.2rem] p-4">
              <div>
                <div>
                  <p className="dashboard-kicker">Projections board</p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-100">Compare modeled outcomes side by side</h2>
                </div>
              </div>
              {onToggleVisibleStrategy ? (
                <div aria-label="Projections board strategy selection" role="group" className="mt-4 flex flex-wrap gap-2">
                  {strategyOrder.map((strategy) => {
                    const isSelected = rows.some((row) => row.key === strategy);

                    return (
                      <button
                        key={`inline-board-strategy-${strategy}`}
                        type="button"
                        onClick={() => onToggleVisibleStrategy(strategy)}
                        aria-pressed={isSelected}
                        className={`tap-feedback rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                          isSelected
                            ? 'btn-selector btn-selector-board btn-selector-projection btn-selector-active text-white'
                            : 'btn-selector btn-selector-board btn-selector-projection text-slate-200'
                        }`}
                      >
                        {strategyLabels[strategy]}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null
        ) : !hideHeader && lockBoardOpen ? (
          <div className="dashboard-block mb-4 flex flex-wrap items-start justify-between gap-3 rounded-xl px-3 py-2 text-left">
            <div>
              <p className="dashboard-kicker">Projections board</p>
              <h2 className="text-lg font-semibold sm:text-xl">Compare selected strategies at a glance</h2>
            </div>
            <span className="dashboard-pill">
              {rows.length} exits
            </span>
          </div>
        ) : !hideHeader ? (
          <button
            type="button"
            aria-expanded={isBoardOpen}
            className={`tap-feedback dashboard-block flex w-full list-none flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2 text-left ${isBoardOpen ? 'mb-4' : 'mb-0'}`}
            onClick={() => setIsBoardOpen((prev) => !prev)}
          >
            <div>
              <p className="dashboard-kicker">Projections board</p>
              <h2 className="text-lg font-semibold sm:text-xl">Compare selected strategies at a glance</h2>
            </div>
            <span className="dashboard-pill inline-flex h-7 min-w-7 items-center justify-center px-2 text-sm font-semibold transition-transform duration-200">
              {isBoardOpen ? '-' : '+'}
            </span>
          </button>
        ) : null}

        {inlineModelingViews || lockBoardOpen || hideHeader ? (
          inlineModelingViews ? inlineComparisonCards : boardContent
        ) : (
          <div className="panel-collapse" data-open={isBoardOpen}>
            <div className="panel-collapse-inner">{boardContent}</div>
          </div>
        )}
      </section>

      {!inlineModelingViews && activeModal === 'equity' ? (
        <div
          className="lightbox-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Equity Modeling Lightbox"
        >
          <div className="section-shell section-shell-projection max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <p className="dashboard-kicker">Master summary</p>
                <h3 className="text-xl font-semibold">Equity modeling by strategy</h3>
                <p className="text-xs text-muted">Modeled Exit combines hold-period cash flow with projected sale proceeds. Break-even if selling tests the earliest month a sale would return your total invested capital.</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="tap-feedback section-action section-action-projection rounded-lg px-3 py-1.5 text-xs text-muted"
              >
                Close
              </button>
            </div>

            {equityModelingContent}
          </div>
        </div>
      ) : null}

      {!inlineModelingViews && activeModal === 'cashflow' ? (
        <div
          className="lightbox-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Cash Flow Modeling Lightbox"
        >
          <div className="section-shell section-shell-projection max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <p className="dashboard-kicker">Master summary</p>
                <h3 className="text-xl font-semibold">Cash flow modeling by strategy</h3>
                <p className="text-xs text-muted">Cash-flow-only view removes the exit event from the final period so you can read operating performance on its own.</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="tap-feedback section-action section-action-projection rounded-lg px-3 py-1.5 text-xs text-muted"
              >
                Close
              </button>
            </div>

            {cashFlowModelingContent}
          </div>
        </div>
      ) : null}
    </>
  );
}

function CompactMetric({
  label,
  value,
  toneStyle,
  tooltip
}: {
  label: string;
  value: string;
  toneStyle?: CSSProperties;
  tooltip?: string;
}) {
  return (
    <article className="section-inner min-w-0 rounded-lg px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted">
        <p>{label}</p>
        {tooltip ? <MetricInfoTooltip label={label} tooltip={tooltip} /> : null}
      </div>
      <p className="mt-1 break-words text-xs font-semibold text-slate-100" style={toneStyle}>
        {value}
      </p>
    </article>
  );
}

function MetricInfoTooltip({ label, tooltip }: { label: string; tooltip: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const tooltipButtonRef = useRef<HTMLButtonElement | null>(null);
  const tooltipPanelRef = useRef<HTMLDivElement | null>(null);
  const { style: tooltipStyle } = useFloatingTooltipPosition({
    open: isOpen,
    anchorRef: tooltipButtonRef,
    tooltipRef: tooltipPanelRef,
    preferredPlacement: 'bottom',
    maxWidth: 280,
    offset: 8,
    zIndex: 180
  });

  const clearCloseTimer = () => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const openTooltip = () => {
    clearCloseTimer();
    setIsOpen(true);
  };

  const scheduleCloseTooltip = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setIsOpen(false);
      closeTimerRef.current = null;
    }, 90);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (tooltipButtonRef.current?.contains(target)) return;
      if (tooltipPanelRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(
    () => () => {
      clearCloseTimer();
    },
    []
  );

  return (
    <span className="relative inline-flex items-center normal-case tracking-normal">
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
          setIsOpen((prev) => !prev);
        }}
      >
        i
      </button>
      {isOpen && typeof document !== 'undefined'
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
              {tooltip}
            </div>,
            document.body
          )
        : null}
    </span>
  );
}

function formatHoldLabel(holdMonths: number) {
  if (holdMonths <= 0) return '0 months';
  if (holdMonths % 12 === 0) {
    const years = holdMonths / 12;
    return `${years} ${years === 1 ? 'year' : 'years'}`;
  }

  return `${holdMonths} mo`;
}

function formatBreakEvenLabel(paybackMonths: number | null) {
  if (paybackMonths === null) return 'Not in hold';
  if (paybackMonths <= 0) return '0 mo';
  return `${paybackMonths} mo`;
}

function ModelBar({
  label,
  value,
  max,
  tone,
  compact = false
}: {
  label: string;
  value: number;
  max: number;
  tone: 'invested' | 'equity' | 'warning';
  compact?: boolean;
}) {
  const width = Math.max(Math.min((Math.abs(value) / Math.max(max, 1)) * 100, 100), 0);
  const toneClass = tone === 'invested' ? 'bg-slate-400' : tone === 'equity' ? 'bg-emerald-400' : 'bg-amber-300';

  return (
    <div>
      <div className={`mb-1 flex items-center justify-between ${compact ? 'text-[10px]' : 'text-xs'} text-muted`}>
        <span>{label}</span>
        <span className="text-white">{currencyFormatter.format(value)}</span>
      </div>
      <div className={`${compact ? 'h-1.5' : 'h-2'} overflow-hidden rounded-full bg-white/10`}>
        <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function CashFlowGraph({ points, compact = false }: { points: { year: number; value: number }[]; compact?: boolean }) {
  const yAxisLabelId = useId();
  const width = 100;
  const height = compact ? 78 : 100;
  const padding = compact ? 6 : 8;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const minValue = Math.min(...points.map((point) => point.value), 0);
  const maxValue = Math.max(...points.map((point) => point.value), 0);
  const range = Math.max(maxValue - minValue, 1);
  const paddedMin = minValue - range * 0.12;
  const paddedMax = maxValue + range * 0.12;
  const domainRange = Math.max(paddedMax - paddedMin, 1);

  const toY = (value: number): number => padding + ((paddedMax - value) / domainRange) * chartHeight;
  const zeroY = toY(0);

  const tickCount = compact ? 4 : 5;
  const yTicks = Array.from({ length: tickCount }, (_, index) => {
    const ratio = index / (tickCount - 1);
    const value = paddedMax - ratio * domainRange;

    return {
      ratio,
      y: toY(value),
      label: currencyFormatter.format(value)
    };
  });

  const barGap = Math.max(points.length - 1, 1);
  const stepX = chartWidth / barGap;
  const barWidth = Math.max(Math.min(stepX * 0.62, compact ? 5 : 6), compact ? 1.8 : 2.25);

  const bars = points.map((point, index) => {
    const xCenter = points.length <= 1 ? width / 2 : padding + index * stepX;
    const valueY = toY(point.value);
    const barTop = Math.min(valueY, zeroY);
    const barHeight = Math.max(Math.abs(zeroY - valueY), 1);

    return {
      ...point,
      x: xCenter,
      barTop,
      barHeight,
      isPositive: point.value >= 0,
      index
    };
  });

  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      <div className={`rounded-lg border border-white/10 bg-[#0A1326] ${compact ? 'p-0' : 'p-2 sm:p-2.5'}`}>
        {!compact ? (
          <div className="mb-1 flex items-center justify-between text-[10px] text-muted">
            <p className="pl-0.5">Annual cash flow</p>
            <p className="pr-0.5 text-right">Operating timeline (years)</p>
          </div>
        ) : null}

        <div className={compact ? 'grid grid-cols-[36px_1fr] gap-1' : 'grid grid-cols-[56px_1fr] gap-1.5 sm:grid-cols-[78px_1fr] sm:gap-2'}>
          <div
            className={`flex flex-col justify-between ${compact ? 'py-1 text-right text-[7px]' : 'py-2 text-right text-[9px] sm:text-[10px]'} text-muted`}
            aria-hidden="true"
          >
            {yTicks.map((tick) => (
              <span key={tick.ratio}>{tick.label}</span>
            ))}
          </div>

          <svg
            viewBox={`0 0 ${width} ${height}`}
            className={compact ? 'h-24 w-full' : 'h-40 w-full sm:h-44'}
            role="img"
            aria-labelledby={yAxisLabelId}
            preserveAspectRatio="none"
          >
            <title id={yAxisLabelId}>Cash flow operating-year bar chart with zoomed annual cash flow axis</title>

            {yTicks.map((tick) => (
              <line
                key={`grid-${tick.ratio}`}
                x1={padding}
                x2={width - padding}
                y1={tick.y}
                y2={tick.y}
                stroke={Math.abs(tick.y - zeroY) < 0.5 ? '#94a3b84d' : '#94a3b81f'}
                strokeDasharray={Math.abs(tick.y - zeroY) < 0.5 ? '4 4' : undefined}
                strokeWidth={Math.abs(tick.y - zeroY) < 0.5 ? '1' : '0.8'}
              />
            ))}

            {bars.map((bar) => (
              <g key={`${bar.year}-${bar.value}-${bar.index}`}>
                <rect
                  x={bar.x - barWidth / 2}
                  y={bar.barTop}
                  width={barWidth}
                  height={bar.barHeight}
                  rx="1.4"
                  fill={bar.isPositive ? '#34d399' : '#fb7185'}
                  opacity={bar.year === 0 ? 0.85 : 1}
                >
                  <animate
                    attributeName="height"
                    from="0"
                    to={String(bar.barHeight)}
                    dur="0.55s"
                    begin={`${Math.min(bar.index * 0.03, 0.36)}s`}
                    fill="freeze"
                  />
                  <animate
                    attributeName="y"
                    from={String(zeroY)}
                    to={String(bar.barTop)}
                    dur="0.55s"
                    begin={`${Math.min(bar.index * 0.03, 0.36)}s`}
                    fill="freeze"
                  />
                </rect>
                <text
                  x={bar.x}
                  y={height - 3}
                  textAnchor="middle"
                  style={{ fill: '#94a3b8', fontSize: compact ? '3.4px' : '4.4px' }}
                >
                  {bar.year}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      <div className={`flex items-center justify-end ${compact ? 'text-[10px]' : 'text-[11px]'} text-muted`}>
        <span>Year {Math.max(points.at(-1)?.year ?? 1, 1)}</span>
      </div>
    </div>
  );
}
