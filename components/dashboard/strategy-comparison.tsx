'use client';

import { useId, useMemo, useState } from 'react';
import type { DealResult } from '@/lib/models/deal';
import { currencyFormatter, percentFormatter } from '@/lib/formatters';
import { getNegativeValueStyle } from '@/lib/negative-value-color';

const rows: { key: keyof Omit<DealResult, 'masterSummary'>; label: string }[] = [
  { key: 'purchase', label: 'Commercial' },
  { key: 'longTerm', label: 'Long-Term Rental' },
  { key: 'airbnb', label: 'Airbnb / STR' },
  { key: 'padSplit', label: 'PadSplit' },
  { key: 'brrrr', label: 'BRRRR' },
  { key: 'flip', label: 'Flip' }
];

interface StrategyComparisonProps {
  data: DealResult;
}

export function StrategyComparison({ data }: StrategyComparisonProps) {
  const [activeModal, setActiveModal] = useState<'equity' | 'cashflow' | null>(null);
  const [isBoardOpen, setIsBoardOpen] = useState(true);
  const maxCashFlow = Math.max(...rows.map((row) => data[row.key].monthlyCashFlow));

  const equityRows = useMemo(() => {
    return rows.map((row) => {
      const output = data[row.key];
      const invested = Math.max(output.totalCashNeeded, 0);
      const saleProceeds = output.saleProceeds ?? 0;
      const yearsHeld = Math.max(output.cashFlowTimeline.length - 1, 1);
      const operationalProfit = output.annualCashFlow * yearsHeld;
      const equityModeled = saleProceeds + operationalProfit;
      const profit = equityModeled - invested;
      const breakEvenYear = output.cashFlowTimeline.findIndex((flow, index) => index > 0 && flow + saleProceeds >= invested);

      return {
        key: row.key,
        label: row.label,
        invested,
        saleProceeds,
        yearsHeld,
        equityModeled,
        profit,
        breakEvenYear: breakEvenYear > 0 ? breakEvenYear : null,
        multiple: invested > 0 ? equityModeled / invested : 0
      };
    });
  }, [data]);

  const maxModeledEquity = Math.max(...equityRows.map((row) => Math.max(row.equityModeled, row.invested, 1)));

  const cashFlowRows = useMemo(() => {
    return rows.map((row) => {
      const output = data[row.key];
      const points = output.cashFlowTimeline.map((value, index) => ({ year: index, value }));
      const saleProceeds = output.saleProceeds ?? 0;
      const cashFlowOnlyPoints = points.slice(1).map((point, index, array) => ({
        ...point,
        value: index === array.length - 1 ? point.value - saleProceeds : point.value
      }));
      const chartPoints = cashFlowOnlyPoints.length > 0 ? cashFlowOnlyPoints : points.slice(0, 1);
      const operatingMaxAbs = Math.max(...chartPoints.map((point) => Math.abs(point.value)), 1);

      return {
        key: row.key,
        label: row.label,
        points,
        chartPoints,
        operatingMaxAbs
      };
    });
  }, [data]);

  return (
    <>
      <section className="min-w-0 max-w-full overflow-hidden rounded-2xl panel-surface p-3 shadow-soft sm:p-5">
        <button
          type="button"
          aria-expanded={isBoardOpen}
          className={`tap-feedback flex w-full list-none flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left ${isBoardOpen ? 'mb-4' : 'mb-0'}`}
          onClick={() => setIsBoardOpen((prev) => !prev)}
        >
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">Master Strategy Board</p>
            <h2 className="text-lg font-semibold sm:text-xl">Compare all exits at a glance</h2>
          </div>
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-white/15 bg-black/20 px-2 text-sm font-semibold text-slate-200 transition-transform duration-200">
            {isBoardOpen ? '-' : '+'}
          </span>
        </button>

        <div className="panel-collapse" data-open={isBoardOpen}>
          <div className="panel-collapse-inner">
            <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveModal('equity')}
            className="tap-feedback rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20"
          >
            Equity modeling
          </button>
          <button
            type="button"
            onClick={() => setActiveModal('cashflow')}
            className="tap-feedback rounded-lg border border-cyan-300/50 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-300/20"
          >
            Cash flow modeling
          </button>
            </div>

            <div className="space-y-3">
          {rows.map((row) => {
            const output = data[row.key];
            const barWidth = maxCashFlow === 0 ? 0 : Math.max((output.monthlyCashFlow / maxCashFlow) * 100, -100);
            const isPositive = output.monthlyCashFlow >= 0;

            return (
              <div
                key={row.key}
                className={`rounded-xl border p-3 ${isPositive ? 'border-white/10 bg-white/5' : 'border-white/10 bg-white/5'}`}
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
                    className={`h-full rounded-full ${isPositive ? 'bg-emerald-400' : 'bg-slate-400'}`}
                    style={{ width: `${Math.abs(barWidth)}%` }}
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-muted sm:grid-cols-5">
                  <span className="text-center">
                    CoC <span style={getNegativeValueStyle(output.cashOnCashReturn, { kind: 'percent' })}>{percentFormatter.format(output.cashOnCashReturn)}</span>
                  </span>
                  <span className="text-center">
                    ROI <span style={getNegativeValueStyle(output.roi, { kind: 'percent' })}>{percentFormatter.format(output.roi)}</span>
                  </span>
                  <span className="text-center">
                    DSCR
                    <span
                      className={`ml-1 inline-flex rounded-full px-1.5 py-0.5 font-semibold ${output.dscr < 1 ? 'bg-red-500/20 text-red-200 ring-1 ring-red-500/40' : 'text-white'}`}
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
          </div>
        </div>
      </section>

      {activeModal === 'equity' ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#040814]/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Equity Modeling Lightbox"
        >
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl panel-surface p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-accent">Master Summary</p>
                <h3 className="text-xl font-semibold">Equity modeling by strategy</h3>
                <p className="text-xs text-muted">Years held and break-even year are based on your Hold Years input.</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="tap-feedback rounded-lg border border-white/15 px-3 py-1.5 text-xs text-muted transition hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {equityRows.map((row) => (
                <div key={row.key} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{row.label}</p>
                    <p
                      className={`text-xs font-medium ${row.profit >= 0 ? 'text-emerald-300' : 'text-red-200'}`}
                      style={getNegativeValueStyle(row.profit, { kind: 'currency' })}
                    >
                      {row.profit >= 0 ? '+' : ''}{currencyFormatter.format(row.profit)} modeled profit
                    </p>
                  </div>

                  <div className="space-y-2">
                    <ModelBar
                      label="Cash invested"
                      value={row.invested}
                      max={maxModeledEquity}
                      tone="invested"
                    />
                    <ModelBar
                      label="Modeled equity at exit"
                      value={row.equityModeled}
                      max={maxModeledEquity}
                      tone={row.equityModeled >= row.invested ? 'equity' : 'warning'}
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
                    <p>Sale proceeds <span className="ml-1 text-white">{currencyFormatter.format(row.saleProceeds)}</span></p>
                    <p>Equity multiple <span className="ml-1 text-white">{row.multiple.toFixed(2)}x</span></p>
                    <p>Years held <span className="ml-1 text-white">{row.yearsHeld}</span></p>
                    <p>
                      Break-even year
                      <span className={`ml-1 ${row.breakEvenYear ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {row.breakEvenYear ? `Year ${row.breakEvenYear}` : 'Not reached'}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {activeModal === 'cashflow' ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#040814]/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Cash Flow Modeling Lightbox"
        >
          <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl panel-surface p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-cyan-200">Master Summary</p>
                <h3 className="text-xl font-semibold">Cash flow modeling by strategy</h3>
                <p className="text-xs text-muted">Cash-flow-only view includes the final year with sale proceeds removed for clean operating trend analysis.</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="tap-feedback rounded-lg border border-white/15 px-3 py-1.5 text-xs text-muted transition hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {cashFlowRows.map((row) => (
                <div key={row.key} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{row.label}</p>
                    <p className="text-xs text-muted">Operating scale: {currencyFormatter.format(row.operatingMaxAbs)}</p>
                  </div>
                  <CashFlowGraph points={row.chartPoints} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ModelBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: 'invested' | 'equity' | 'warning' }) {
  const width = Math.max(Math.min((Math.abs(value) / Math.max(max, 1)) * 100, 100), 0);
  const toneClass = tone === 'invested' ? 'bg-slate-400' : tone === 'equity' ? 'bg-emerald-400' : 'bg-amber-300';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="text-white">{currencyFormatter.format(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function CashFlowGraph({ points }: { points: { year: number; value: number }[] }) {
  const yAxisLabelId = useId();
  const width = 560;
  const height = 220;
  const padding = 24;
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

  const tickCount = 5;
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
  const barWidth = Math.max(Math.min(stepX * 0.62, 34), 10);

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
    <div className="space-y-2">
      <div className="rounded-lg border border-white/10 bg-[#0A1326] p-2 sm:p-2.5">
        <div className="mb-1 flex items-center justify-between text-[10px] text-muted">
          <p className="pl-0.5">Annual cash flow</p>
          <p className="pr-0.5 text-right">Operating timeline (years)</p>
        </div>

        <div className="grid grid-cols-[56px_1fr] gap-1.5 sm:grid-cols-[78px_1fr] sm:gap-2">
          <div className="flex flex-col justify-between py-2 text-right text-[9px] text-muted sm:text-[10px]" aria-hidden="true">
            {yTicks.map((tick) => (
              <span key={tick.ratio}>{tick.label}</span>
            ))}
          </div>

          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-40 w-full sm:h-44"
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
                  rx="4"
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
                  y={height - 4}
                  textAnchor="middle"
                  className="fill-slate-400 text-[9px]"
                >
                  {bar.year}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      <div className="flex items-center justify-end text-[11px] text-muted">
        <span>Year {Math.max(points.at(-1)?.year ?? 1, 1)}</span>
      </div>
    </div>
  );
}
