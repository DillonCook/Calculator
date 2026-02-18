'use client';

import { useId, useMemo, useState } from 'react';
import type { DealResult } from '@/lib/models/deal';
import { currencyFormatter, percentFormatter } from '@/lib/formatters';

const rows: { key: keyof Omit<DealResult, 'masterSummary'>; label: string }[] = [
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
      const maxAbs = Math.max(...points.map((point) => Math.abs(point.value)), 1);

      return {
        key: row.key,
        label: row.label,
        points,
        maxAbs
      };
    });
  }, [data]);

  return (
    <>
      <section className="rounded-2xl border border-white/10 bg-panel p-5 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">Master Strategy Board</p>
            <h2 className="text-xl font-semibold">Compare all exits at a glance</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveModal('equity')}
              className="rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20"
            >
              Equity modeling
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('cashflow')}
              className="rounded-lg border border-cyan-300/50 bg-cyan-300/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-300/20"
            >
              Cash flow modeling
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {rows.map((row) => {
            const output = data[row.key];
            const barWidth = maxCashFlow === 0 ? 0 : Math.max((output.monthlyCashFlow / maxCashFlow) * 100, -100);
            const isPositive = output.monthlyCashFlow >= 0;

            return (
              <div key={row.key} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{row.label}</p>
                  <p className={`text-base font-semibold ${isPositive ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {currencyFormatter.format(output.monthlyCashFlow)}
                    <span className="ml-1 text-xs text-muted">/mo</span>
                  </p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${isPositive ? 'bg-emerald-400' : 'bg-rose-400'}`}
                    style={{ width: `${Math.abs(barWidth)}%` }}
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-muted sm:grid-cols-5">
                  <span className="text-center">CoC {percentFormatter.format(output.cashOnCashReturn)}</span>
                  <span className="text-center">ROI {percentFormatter.format(output.roi)}</span>
                  <span className="text-center">DSCR {output.dscr.toFixed(2)}</span>
                  <span className="text-center">IRR {percentFormatter.format(output.irr)}</span>
                  <span className="text-center">Cap {percentFormatter.format(output.capRate)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {activeModal === 'equity' ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#040814]/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Equity Modeling Lightbox"
        >
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/10 bg-panel p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-accent">Master Summary</p>
                <h3 className="text-xl font-semibold">Equity modeling by strategy</h3>
                <p className="text-xs text-muted">Years held and break-even year are based on your Hold Years input.</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-muted transition hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {equityRows.map((row) => (
                <div key={row.key} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{row.label}</p>
                    <p className={`text-xs font-medium ${row.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
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
          <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-white/10 bg-panel p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-cyan-200">Master Summary</p>
                <h3 className="text-xl font-semibold">Cash flow modeling by strategy</h3>
                <p className="text-xs text-muted">Annual timeline including initial cash outlay and terminal sale event.</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-muted transition hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {cashFlowRows.map((row) => (
                <div key={row.key} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{row.label}</p>
                    <p className="text-xs text-muted">Peak scale: {currencyFormatter.format(row.maxAbs)}</p>
                  </div>
                  <CashFlowGraph points={row.points} maxAbs={row.maxAbs} />
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

function CashFlowGraph({ points, maxAbs }: { points: { year: number; value: number }[]; maxAbs: number }) {
  const gradientId = useId();
  const width = 560;
  const height = 220;
  const padding = 24;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const normalizedPoints = points.map((point, index) => {
    const x = points.length <= 1 ? width / 2 : padding + (index / (points.length - 1)) * chartWidth;
    const normalizedValue = maxAbs === 0 ? 0 : point.value / maxAbs;
    const y = padding + ((1 - normalizedValue) / 2) * chartHeight;

    return {
      ...point,
      x,
      y
    };
  });

  const linePath = normalizedPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const zeroY = padding + chartHeight / 2;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#0A1326] p-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-44 min-w-[460px] w-full" role="img" aria-label="Cash flow line graph by year">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
          </defs>

          <line x1={padding} x2={width - padding} y1={zeroY} y2={zeroY} stroke="#94a3b833" strokeDasharray="4 4" strokeWidth="1" />

          <path d={linePath} fill="none" stroke={`url(#${gradientId})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {normalizedPoints.map((point) => {
            const isPositive = point.value >= 0;
            return (
              <g key={`${point.year}-${point.value}`}>
                <circle cx={point.x} cy={point.y} r="4" fill={isPositive ? '#34d399' : '#fb7185'} />
                <text x={point.x} y={point.y - 10} textAnchor="middle" className="fill-slate-200 text-[9px]">
                  {point.year === 0 ? 'I' : point.year}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>Initial</span>
        <span>Year {Math.max(points.length - 1, 1)}</span>
      </div>
      <p className="text-[11px] text-muted">Dashed line is break-even zero cash flow.</p>
    </div>
  );
}
