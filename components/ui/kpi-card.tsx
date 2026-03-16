'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getNegativeValueStyle, type NegativeValueKind } from '@/lib/negative-value-color';
import { useFloatingTooltipPosition } from '@/lib/use-floating-tooltip-position';

interface KpiDefinition {
  term: string;
  description: string;
}

interface KpiCardProps {
  label: string;
  value: string;
  numericValue?: number;
  numericValueKind?: NegativeValueKind;
  numericValueBaseline?: number;
  tone?: 'default' | 'success';
  helper?: string;
  winner?: string;
  secondaryLabel?: string;
  secondaryValue?: string;
  definitions?: KpiDefinition[];
  backgroundChart?: 'none' | 'cashflowBars';
  chartSeries?: number[];
  valueTestId?: string;
  layout?: 'default' | 'compact';
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
  numericValue,
  numericValueKind = 'plain',
  numericValueBaseline = 0,
  helper,
  winner,
  tone = 'default',
  secondaryLabel,
  secondaryValue,
  definitions,
  backgroundChart = 'none',
  chartSeries,
  valueTestId,
  layout = 'default'
}: KpiCardProps) {
  const isCompact = layout === 'compact';
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const closeTooltipTimerRef = useRef<number | null>(null);
  const tooltipId = `kpi-tooltip-${slugify(label)}`;
  const tooltipAnchorRef = useRef<HTMLDivElement | null>(null);
  const tooltipTriggerRef = useRef<HTMLButtonElement | null>(null);
  const tooltipPanelRef = useRef<HTMLDivElement | null>(null);
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
  const negativeValueStyle = useMemo(
    () => getNegativeValueStyle(numericValue ?? Number.NaN, { kind: numericValueKind, baseline: numericValueBaseline }),
    [numericValue, numericValueBaseline, numericValueKind]
  );
  const { style: tooltipStyle } = useFloatingTooltipPosition({
    open: isTooltipOpen,
    anchorRef: tooltipTriggerRef,
    tooltipRef: tooltipPanelRef,
    preferredPlacement: 'bottom',
    maxWidth: 320,
    offset: 10,
    zIndex: 190
  });

  const clearCloseTooltipTimer = () => {
    if (closeTooltipTimerRef.current === null) return;
    window.clearTimeout(closeTooltipTimerRef.current);
    closeTooltipTimerRef.current = null;
  };

  const openTooltip = () => {
    clearCloseTooltipTimer();
    setIsTooltipOpen(true);
  };

  const scheduleCloseTooltip = () => {
    clearCloseTooltipTimer();
    closeTooltipTimerRef.current = window.setTimeout(() => {
      setIsTooltipOpen(false);
      closeTooltipTimerRef.current = null;
    }, 90);
  };

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
      clearCloseTooltipTimer();
    },
    []
  );

  return (
    <div className={`relative min-w-0 overflow-visible card-surface shadow-soft ${isCompact ? 'rounded-xl p-2' : 'rounded-2xl p-2.5 sm:p-4'}`}>
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
      {definitions?.length ? (
        <div ref={tooltipAnchorRef} className={`absolute z-30 ${isCompact ? 'right-1.5 top-1.5' : 'right-2.5 top-2.5 sm:right-3 sm:top-3'}`}>
          <button
            ref={tooltipTriggerRef}
            type="button"
            aria-label={`${label} definitions`}
            aria-expanded={isTooltipOpen}
            aria-controls={tooltipId}
            className={`inline-flex items-center justify-center rounded-full border border-white/20 bg-slate-900 text-[10px] font-semibold text-slate-200 transition hover:border-accent/70 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${isCompact ? 'h-[1.1rem] w-[1.1rem]' : 'h-5 w-5'}`}
            onMouseEnter={openTooltip}
            onMouseLeave={scheduleCloseTooltip}
            onFocus={openTooltip}
            onBlur={scheduleCloseTooltip}
            onClick={() => {
              clearCloseTooltipTimer();
              setIsTooltipOpen((prev) => !prev);
            }}
          >
            i
          </button>

          {isTooltipOpen && typeof document !== 'undefined'
            ? createPortal(
                <div
                  ref={tooltipPanelRef}
                  id={tooltipId}
                  role="dialog"
                  aria-modal="false"
                  className="rounded-xl border border-[#304661] bg-[#0b1629] p-3 text-xs text-slate-100 shadow-[0_12px_28px_rgba(3,10,20,0.68)]"
                  style={tooltipStyle}
                  onMouseEnter={openTooltip}
                  onMouseLeave={scheduleCloseTooltip}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{label} details</p>
                    <button
                      type="button"
                      className="rounded-md border border-white/15 px-2 py-0.5 text-[11px] text-slate-200"
                      onClick={() => setIsTooltipOpen(false)}
                    >
                      Close
                    </button>
                  </div>
                  {definitions.map((definition) => (
                    <p key={definition.term} className="leading-relaxed [&:not(:first-child)]:mt-2">
                      <span className="font-semibold text-white">{definition.term}:</span> {definition.description}
                    </p>
                  ))}
                </div>,
                document.body
              )
            : null}
        </div>
      ) : null}

      <div className={`relative z-10 flex min-w-0 items-center gap-2 ${isCompact ? 'pr-[1.125rem]' : 'pr-6 sm:pr-7'}`}>
        <p className={`min-w-0 truncate uppercase tracking-wide text-muted ${isCompact ? 'text-[10px]' : 'text-[11px] sm:text-xs'}`}>{label}</p>
      </div>

      {winner ? (
        <p
          className={`relative z-10 italic tracking-wide text-accent/90 ${isCompact ? 'mt-0.5 truncate text-[10px]' : 'mt-1 text-[11px] sm:text-xs'}`}
          aria-label={`${label} strategy context`}
        >
          {winner}
        </p>
      ) : null}

      <p
        ref={primaryValueRef}
        className={`relative z-10 font-semibold leading-tight ${tone === 'success' ? 'text-emerald-300' : 'text-white'} ${
          isCompact ? 'mt-0.5 text-[clamp(0.9rem,1.4vw,1.22rem)] 2xl:text-[1.32rem]' : 'mt-1 text-[clamp(1rem,5.6vw,1.5rem)] sm:text-3xl md:text-4xl'
        }`}
        data-testid={valueTestId ?? `kpi-${slugify(label)}`}
        style={negativeValueStyle}
      >
        {value}
      </p>

      {secondaryLabel && secondaryValue ? (
        <div className={`relative z-10 rounded-lg border border-white/10 bg-white/[0.03] ${isCompact ? 'mt-1 px-2 py-1' : 'mt-2 px-2 py-1.5 sm:px-2.5 sm:py-2'}`}>
          <p className={`uppercase tracking-wide text-muted ${isCompact ? 'text-[9px]' : 'text-[10px] sm:text-[11px]'}`}>{secondaryLabel}</p>
          <p
            ref={secondaryValueRef}
            className={`font-semibold text-white ${isCompact ? 'text-[11px]' : 'text-xs sm:text-base'}`}
            data-testid={`kpi-${slugify(secondaryLabel)}`}
          >
            {secondaryValue}
          </p>
        </div>
      ) : null}

      {helper ? <p className={`relative z-10 text-muted ${isCompact ? 'mt-0.5 text-[9px] leading-[1.35]' : 'mt-2 text-[11px] sm:text-xs'}`}>{helper}</p> : null}
    </div>
  );
}
