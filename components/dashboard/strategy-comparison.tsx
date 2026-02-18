'use client';

import { useMemo, useState } from 'react';
import type { DealResult } from '@/lib/models/deal';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

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
  const [isEquityModalOpen, setIsEquityModalOpen] = useState(false);
  const maxCashFlow = Math.max(...rows.map((row) => data[row.key].monthlyCashFlow));

  const equityRows = useMemo(() => {
    return rows.map((row) => {
      const output = data[row.key];
      const invested = Math.max(output.totalCashNeeded, 0);
      const saleProceeds = output.saleProceeds ?? 0;
      const operationalProfit = output.annualCashFlow * Math.max(output.cashFlowTimeline.length - 1, 1);
      const equityModeled = saleProceeds + operationalProfit;
      const profit = equityModeled - invested;

      return {
        key: row.key,
        label: row.label,
        invested,
        saleProceeds,
        equityModeled,
        profit,
        multiple: invested > 0 ? equityModeled / invested : 0
      };
    });
  }, [data]);

  const maxModeledEquity = Math.max(...equityRows.map((row) => Math.max(row.equityModeled, row.invested, 1)));

  return (
    <>
      <section className="rounded-2xl border border-white/10 bg-panel p-5 shadow-soft">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">Master Strategy Board</p>
            <h2 className="text-xl font-semibold">Compare all exits at a glance</h2>
          </div>
          <button
            type="button"
            onClick={() => setIsEquityModalOpen(true)}
            className="rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20"
          >
            Equity modeling
          </button>
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
                    {currency.format(output.monthlyCashFlow)}
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
                  <span className="text-center">CoC {percent.format(output.cashOnCashReturn)}</span>
                  <span className="text-center">ROI {percent.format(output.roi)}</span>
                  <span className="text-center">DSCR {output.dscr.toFixed(2)}</span>
                  <span className="text-center">IRR {percent.format(output.irr)}</span>
                  <span className="text-center">Cap {percent.format(output.capRate)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {isEquityModalOpen ? (
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
              </div>
              <button
                type="button"
                onClick={() => setIsEquityModalOpen(false)}
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
                      {row.profit >= 0 ? '+' : ''}{currency.format(row.profit)} modeled profit
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
                    <p>Sale proceeds <span className="ml-1 text-white">{currency.format(row.saleProceeds)}</span></p>
                    <p>Equity multiple <span className="ml-1 text-white">{row.multiple.toFixed(2)}x</span></p>
                  </div>
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
        <span className="text-white">{currency.format(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
