import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MasterAssumptions, StrategyOutput } from '@/lib/models/deal';
import { currencyFormatter, percentFormatter } from '@/lib/formatters';
import { getNegativeValueStyle } from '@/lib/negative-value-color';
import { useFloatingTooltipPosition } from '@/lib/use-floating-tooltip-position';

interface TimelineCardProps {
  output: StrategyOutput;
  assumptions: MasterAssumptions;
  defaultOpen?: boolean;
  collapsible?: boolean;
  summaryVariant?: 'cards' | 'compact';
}

export function TimelineCard({
  output,
  assumptions,
  defaultOpen = true,
  collapsible = true,
  summaryVariant = 'cards'
}: TimelineCardProps) {
  const [isIrrTooltipOpen, setIsIrrTooltipOpen] = useState(false);
  const closeTooltipTimerRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const tooltipAnchorRef = useRef<HTMLDivElement | null>(null);
  const tooltipTriggerRef = useRef<HTMLButtonElement | null>(null);
  const tooltipPanelRef = useRef<HTMLDivElement | null>(null);
  const { style: tooltipStyle } = useFloatingTooltipPosition({
    open: isIrrTooltipOpen,
    anchorRef: tooltipTriggerRef,
    tooltipRef: tooltipPanelRef,
    preferredPlacement: 'bottom',
    maxWidth: 340,
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
    setIsIrrTooltipOpen(true);
  };

  const scheduleCloseTooltip = () => {
    clearCloseTooltipTimer();
    closeTooltipTimerRef.current = window.setTimeout(() => {
      setIsIrrTooltipOpen(false);
      closeTooltipTimerRef.current = null;
    }, 90);
  };

  useEffect(() => {
    setIsOpen(collapsible ? defaultOpen : true);
  }, [collapsible, defaultOpen]);

  useEffect(() => {
    if (!isIrrTooltipOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (tooltipAnchorRef.current?.contains(target)) return;
      if (tooltipPanelRef.current?.contains(target)) return;
      setIsIrrTooltipOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsIrrTooltipOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isIrrTooltipOpen]);

  useEffect(
    () => () => {
      clearCloseTooltipTimer();
    },
    []
  );

  const isExpanded = collapsible ? isOpen : true;
  const holdRangeLabel = `Years 0 - ${assumptions.holdYears}`;
  const compactReferenceItems = [
    { label: 'Hold', value: `${assumptions.holdYears}y` },
    { label: 'NOI', value: percentFormatter.format(assumptions.noiGrowthPercent) },
    { label: 'Appreciation', value: percentFormatter.format(assumptions.annualAppreciationPercent) },
    { label: 'Sell', value: percentFormatter.format(assumptions.sellingCostPercent) }
  ];

  const timelineContent = (
    <>
      {summaryVariant === 'compact' ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Reference assumptions</p>
            <span className="rounded-full border border-white/15 bg-black/20 px-2 py-0.5 text-[11px] text-slate-200">Read-only</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
            {compactReferenceItems.map((item) => (
              <span key={item.label} className="rounded-full border border-white/10 bg-black/20 px-2 py-1">
                {item.label}: <span className="text-slate-100">{item.value}</span>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryMetric label="Hold years" value={`${assumptions.holdYears}`} />
          <SummaryMetric label="NOI growth" value={percentFormatter.format(assumptions.noiGrowthPercent)} />
          <SummaryMetric label="Appreciation" value={percentFormatter.format(assumptions.annualAppreciationPercent)} />
          <SummaryMetric label="Selling cost" value={percentFormatter.format(assumptions.sellingCostPercent)} />
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted">Reference only. Edit exit and IRR assumptions from Inputs.</p>

      <div className="scrollbar-premium mt-3 grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {output.cashFlowTimeline.map((flow, index) => (
          <div key={index} className="rounded-lg border border-white/10 bg-white/5 p-2 text-sm">
            <p className="text-xs text-muted">Year {index}</p>
            <p
              className={`mt-1 font-semibold ${flow >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
              style={getNegativeValueStyle(flow, { kind: 'currency' })}
            >
              {currencyFormatter.format(flow)}
            </p>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <section className="min-w-0 max-w-full overflow-visible rounded-2xl panel-surface p-3 shadow-soft sm:p-5">
      {collapsible ? (
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          className={`tap-feedback flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 ${isExpanded ? 'mb-4' : 'mb-0'}`}
          onClick={() => setIsOpen((prev) => !prev)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            setIsOpen((prev) => !prev);
          }}
        >
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">Cash Flow Timeline</p>
            <h3 className="text-lg font-semibold sm:text-xl">IRR Stream</h3>
          </div>
          <div ref={tooltipAnchorRef} className="relative flex shrink-0 items-center gap-2 self-start">
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-white/15 bg-black/20 px-2 text-sm font-semibold text-slate-200 transition-transform duration-200">
              {isExpanded ? '-' : '+'}
            </span>
            <button
              ref={tooltipTriggerRef}
              type="button"
              aria-label="IRR stream explanation"
              aria-expanded={isIrrTooltipOpen}
              onClick={(event) => {
                event.stopPropagation();
                clearCloseTooltipTimer();
                setIsIrrTooltipOpen((prev) => !prev);
              }}
              onMouseEnter={openTooltip}
              onMouseLeave={scheduleCloseTooltip}
              onFocus={openTooltip}
              onBlur={scheduleCloseTooltip}
              className="tap-feedback inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/[0.03] text-[10px] font-semibold text-muted opacity-85 transition hover:border-accent/70 hover:text-accent hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              i
            </button>

            {isIrrTooltipOpen && typeof document !== 'undefined'
              ? createPortal(
                  <div
                    ref={tooltipPanelRef}
                    className="rounded-xl border border-[#304661] bg-[#0b1629] p-3 text-xs leading-relaxed text-slate-100 shadow-[0_12px_28px_rgba(3,10,20,0.68)]"
                    style={tooltipStyle}
                    onClick={(event) => event.stopPropagation()}
                    onMouseEnter={openTooltip}
                    onMouseLeave={scheduleCloseTooltip}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">IRR stream details</p>
                      <button
                        type="button"
                        className="tap-feedback rounded-md border border-white/15 px-2 py-0.5 text-[11px] text-slate-200"
                        onClick={(event) => {
                          event.stopPropagation();
                          setIsIrrTooltipOpen(false);
                        }}
                      >
                        Close
                      </button>
                    </div>
                    <p>
                      <span className="font-semibold text-white">Why IRR stream matters:</span> it captures the timing of every yearly cash flow and your projected sale proceeds,
                      so two deals with the same total profit can rank very differently. IRR helps you spot faster capital velocity and lower hold-time risk.
                    </p>
                  </div>,
                  document.body
                )
              : null}
          </div>
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">Cash Flow Timeline</p>
            <h3 className="text-lg font-semibold sm:text-xl">IRR Stream</h3>
          </div>
          <div ref={tooltipAnchorRef} className="relative flex shrink-0 items-center gap-2 self-start">
            <span className="rounded-full border border-white/15 bg-black/20 px-2.5 py-1 text-[11px] text-slate-200">{holdRangeLabel}</span>
            <button
              ref={tooltipTriggerRef}
              type="button"
              aria-label="IRR stream explanation"
              aria-expanded={isIrrTooltipOpen}
              onClick={() => {
                clearCloseTooltipTimer();
                setIsIrrTooltipOpen((prev) => !prev);
              }}
              onMouseEnter={openTooltip}
              onMouseLeave={scheduleCloseTooltip}
              onFocus={openTooltip}
              onBlur={scheduleCloseTooltip}
              className="tap-feedback inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/[0.03] text-[10px] font-semibold text-muted opacity-85 transition hover:border-accent/70 hover:text-accent hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              i
            </button>

            {isIrrTooltipOpen && typeof document !== 'undefined'
              ? createPortal(
                  <div
                    ref={tooltipPanelRef}
                    className="rounded-xl border border-[#304661] bg-[#0b1629] p-3 text-xs leading-relaxed text-slate-100 shadow-[0_12px_28px_rgba(3,10,20,0.68)]"
                    style={tooltipStyle}
                    onClick={(event) => event.stopPropagation()}
                    onMouseEnter={openTooltip}
                    onMouseLeave={scheduleCloseTooltip}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">IRR stream details</p>
                      <button
                        type="button"
                        className="tap-feedback rounded-md border border-white/15 px-2 py-0.5 text-[11px] text-slate-200"
                        onClick={(event) => {
                          event.stopPropagation();
                          setIsIrrTooltipOpen(false);
                        }}
                      >
                        Close
                      </button>
                    </div>
                    <p>
                      <span className="font-semibold text-white">Why IRR stream matters:</span> it captures the timing of every yearly cash flow and your projected sale proceeds,
                      so two deals with the same total profit can rank very differently. IRR helps you spot faster capital velocity and lower hold-time risk.
                    </p>
                  </div>,
                  document.body
                )
              : null}
          </div>
        </div>
      )}

      {collapsible ? (
        <div className="panel-collapse" data-open={isExpanded}>
          <div className="panel-collapse-inner">{timelineContent}</div>
        </div>
      ) : (
        timelineContent
      )}
    </section>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </article>
  );
}
