'use client';

import { useEffect, useMemo, useRef } from 'react';

interface KpiDefinition {
  term: string;
  description: string;
}

interface KpiCardProps {
  label: string;
  value: string;
  tone?: 'default' | 'success';
  helper?: string;
  winner?: string;
  secondaryLabel?: string;
  secondaryValue?: string;
  definitions?: KpiDefinition[];
  backgroundChart?: 'none' | 'cashflowBars';
  chartSeries?: number[];
}

interface ChartPoint {
  x: number;
  y: number;
}

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const defaultChartSeries = [52, 44, 58, 49, 64, 56, 72, 61, 68, 59, 76, 71];

const buildChartPoints = (series?: number[]): ChartPoint[] => {
  const source = series?.length ? series : defaultChartSeries;
  const maxValue = Math.max(...source.map((value) => Math.abs(value)), 1);
  const horizontalStep = source.length > 1 ? 100 / (source.length - 1) : 100;

  return source.map((value, index) => {
    const normalized = Math.max(0.16, Math.abs(value) / maxValue);
    const y = 40 - normalized * 32;
    return {
      x: source.length > 1 ? index * horizontalStep : 50,
      y
    };
  });
};

const buildSmoothPath = (points: ChartPoint[]) => {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const controlX = (previous.x + current.x) / 2;
    path += ` Q ${controlX} ${previous.y}, ${current.x} ${current.y}`;
  }

  return path;
};

const resolveRibbonPalette = (isNegative: boolean) => {
  if (isNegative) {
    return {
      strokeStops: ['#8B9BFF', '#B7A8FF', '#E8D9FF', '#FFF1F9'],
      areaTop: '#8B9BFF',
      areaBottom: '#7E6EAA',
      glow: 'rgba(180,150,255,0.34)'
    };
  }

  return {
    strokeStops: ['#6EA8FF', '#9ED0FF', '#E0F2FF', '#FFFFFF'],
    areaTop: '#4F8DFD',
    areaBottom: '#6E7E9C',
    glow: 'rgba(120,180,255,0.35)'
  };
};

export function KpiCard({
  label,
  value,
  helper,
  winner,
  tone = 'default',
  secondaryLabel,
  secondaryValue,
  definitions,
  backgroundChart = 'none',
  chartSeries
}: KpiCardProps) {
  const primaryValueRef = useRef<HTMLParagraphElement | null>(null);
  const secondaryValueRef = useRef<HTMLParagraphElement | null>(null);
  const chartPoints = useMemo(() => buildChartPoints(chartSeries), [chartSeries]);
  const linePath = useMemo(() => buildSmoothPath(chartPoints), [chartPoints]);
  const areaPath = useMemo(() => (linePath ? `${linePath} L 100 40 L 0 40 Z` : ''), [linePath]);
  const isNegativeRibbon = useMemo(() => {
    const source = chartSeries?.length ? chartSeries : defaultChartSeries;
    if (!source.length) return false;
    const average = source.reduce((sum, value) => sum + value, 0) / source.length;
    return average < 0 || source[source.length - 1] < 0;
  }, [chartSeries]);
  const ribbonPalette = useMemo(() => resolveRibbonPalette(isNegativeRibbon), [isNegativeRibbon]);
  const gradientId = `kpi-cashflow-line-${slugify(label)}`;
  const areaGradientId = `kpi-cashflow-area-${slugify(label)}`;
  const filterId = `kpi-cashflow-glow-${slugify(label)}`;

  useEffect(() => {
    if (typeof primaryValueRef.current?.animate === 'function') {
      primaryValueRef.current.animate(
        [
          { opacity: 0.55, transform: 'translateY(4px) scale(0.985)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' }
        ],
        { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    }

    if (typeof secondaryValueRef.current?.animate === 'function') {
      secondaryValueRef.current.animate(
        [
          { opacity: 0.55, transform: 'translateY(4px) scale(0.985)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' }
        ],
        { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    }
  }, [value, secondaryValue]);

  return (
    <div className="relative min-w-0 overflow-hidden rounded-2xl card-surface p-2.5 shadow-soft sm:p-4">
      {backgroundChart === 'cashflowBars' ? (
        <div className="pointer-events-none absolute inset-0 z-0 select-none">
          <div
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                'radial-gradient(circle at 18% 20%, rgba(148, 186, 255, 0.24) 0.6px, transparent 1.2px), radial-gradient(circle at 78% 32%, rgba(164, 198, 255, 0.18) 0.5px, transparent 1.1px), radial-gradient(circle at 62% 74%, rgba(129, 170, 241, 0.14) 0.8px, transparent 1.6px)',
              backgroundSize: '90px 90px, 120px 120px, 140px 140px'
            }}
            aria-hidden="true"
          />
          <svg viewBox="0 0 100 40" className="absolute inset-x-0 bottom-0 h-[44%] w-full" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={ribbonPalette.strokeStops[0]} />
                <stop offset="40%" stopColor={ribbonPalette.strokeStops[1]} />
                <stop offset="75%" stopColor={ribbonPalette.strokeStops[2]} />
                <stop offset="100%" stopColor={ribbonPalette.strokeStops[3]} />
              </linearGradient>
              <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ribbonPalette.areaTop} stopOpacity="0.3" />
                <stop offset="100%" stopColor={ribbonPalette.areaBottom} stopOpacity="0.05" />
              </linearGradient>
              <filter id={filterId} x="-20%" y="-20%" width="140%" height="160%">
                <feDropShadow dx="0" dy="0" stdDeviation="1.15" floodColor={ribbonPalette.glow} />
              </filter>
            </defs>
            {[8, 14, 20, 26, 32].map((lineY) => (
              <line key={`${label}-grid-${lineY}`} x1="0" y1={lineY} x2="100" y2={lineY} stroke="#9FB6CF" strokeOpacity="0.09" strokeWidth="0.35" />
            ))}
            {areaPath ? <path d={areaPath} fill={`url(#${areaGradientId})`} /> : null}
            {linePath ? (
              <>
                <path d={linePath} fill="none" stroke={`url(#${gradientId})`} strokeWidth="2.1" strokeLinecap="round" filter={`url(#${filterId})`} className="sm:hidden" />
                <path d={linePath} fill="none" stroke={`url(#${gradientId})`} strokeWidth="2.8" strokeLinecap="round" filter={`url(#${filterId})`} className="hidden sm:block" />
              </>
            ) : null}
            {chartPoints.map((point, index) => (
              <circle key={`${label}-point-${index}`} cx={point.x} cy={point.y} r="0.82" fill={ribbonPalette.strokeStops[1]} opacity="0.45" />
            ))}
          </svg>
        </div>
      ) : null}
      <div className="relative z-10 flex min-w-0 items-center gap-2">
        <p className="min-w-0 truncate text-[11px] uppercase tracking-wide text-muted sm:text-xs">{label}</p>
        {definitions?.length ? (
          <div className="group/tooltip relative">
            <button
              type="button"
              aria-label={`${label} definitions`}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 bg-white/[0.03] text-[10px] font-semibold text-muted transition hover:border-accent/70 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              i
            </button>
            <div className="pointer-events-none absolute left-0 top-6 z-20 w-[260px] rounded-lg border border-white/10 bg-[#0F1A31]/95 p-3 text-xs text-slate-200 opacity-0 shadow-soft backdrop-blur transition duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100">
              {definitions.map((definition) => (
                <p key={definition.term} className="leading-relaxed [&:not(:first-child)]:mt-2">
                  <span className="font-semibold text-white">{definition.term}:</span> {definition.description}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {winner ? (
        <p className="relative z-10 mt-1 text-[11px] italic tracking-wide text-accent/90 sm:text-xs" aria-label={`${label} strategy context`}>
          {winner}
        </p>
      ) : null}

      <p
        ref={primaryValueRef}
        className={`relative z-10 mt-1 text-[clamp(1rem,5.6vw,1.5rem)] font-semibold leading-tight sm:text-3xl md:text-4xl ${tone === 'success' ? 'text-emerald-300' : 'text-white'}`}
        data-testid={`kpi-${slugify(label)}`}
      >
        {value}
      </p>

      {secondaryLabel && secondaryValue ? (
        <div className="relative z-10 mt-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 sm:px-2.5 sm:py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted sm:text-[11px]">{secondaryLabel}</p>
          <p ref={secondaryValueRef} className="text-xs font-semibold text-white sm:text-base" data-testid={`kpi-${slugify(secondaryLabel)}`}>
            {secondaryValue}
          </p>
        </div>
      ) : null}

      {helper ? <p className="relative z-10 mt-2 text-[11px] text-muted sm:text-xs">{helper}</p> : null}
    </div>
  );
}
