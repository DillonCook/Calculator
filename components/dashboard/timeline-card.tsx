import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MasterAssumptions, StrategyOutput } from '@/lib/models/deal';
import { currencyFormatter, percentFormatter } from '@/lib/formatters';
import { getNegativeValueStyle } from '@/lib/negative-value-color';
import { useFloatingTooltipPosition } from '@/lib/use-floating-tooltip-position';
import { AssumptionsPanel } from '@/components/dashboard/assumptions-panel';

interface TimelineCardProps {
  output: StrategyOutput;
  assumptions: MasterAssumptions;
  defaultOpen?: boolean;
  collapsible?: boolean;
  summaryVariant?: 'cards' | 'compact';
  onAssumptionsChange?: (updates: Partial<MasterAssumptions>) => void;
  showTargetIrrInput?: boolean;
  layoutVariant?: 'panel' | 'strip';
}

export function TimelineCard({
  output,
  assumptions,
  defaultOpen = true,
  collapsible = true,
  summaryVariant = 'cards',
  onAssumptionsChange,
  showTargetIrrInput = false,
  layoutVariant = 'panel'
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
  const showEmbeddedAssumptions = Boolean(onAssumptionsChange);
  const isStrip = layoutVariant === 'strip';
  const compactReferenceItems = [
    { label: 'Hold', value: `${assumptions.holdYears}y` },
    { label: 'NOI', value: percentFormatter.format(assumptions.noiGrowthPercent) },
    { label: 'Appreciation', value: percentFormatter.format(assumptions.annualAppreciationPercent) },
    { label: 'Sell', value: percentFormatter.format(assumptions.sellingCostPercent) }
  ];
  const renderIrrTooltipControl = (positionClassName: string) => (
    <div ref={tooltipAnchorRef} className={positionClassName}>
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
        className="info-trigger tap-feedback inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold opacity-85"
      >
        i
      </button>

      {isIrrTooltipOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={tooltipPanelRef}
              className="tooltip-surface rounded-xl p-3 text-xs leading-relaxed"
              style={tooltipStyle}
              onClick={(event) => event.stopPropagation()}
              onMouseEnter={openTooltip}
              onMouseLeave={scheduleCloseTooltip}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-slate-300">IRR stream details</p>
                <button
                  type="button"
                  className="tooltip-close tap-feedback rounded-md px-2 py-0.5 text-[11px]"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsIrrTooltipOpen(false);
                  }}
                >
                  Close
                </button>
              </div>
              <p>
                <span className="font-semibold text-white">Why IRR stream matters:</span> it captures the timing of every yearly cash flow and your projected sale proceeds, so two deals with the same total profit can rank very differently. IRR helps you spot faster capital velocity and lower hold-time risk.
              </p>
            </div>,
            document.body
          )
        : null}
    </div>
  );

  const timelineContent = (
    <>
      {showEmbeddedAssumptions ? (
        <div className="dashboard-block relative rounded-[1.35rem] p-3 shadow-soft sm:p-4">
          <div className="pr-12 sm:pr-14">
            <div>
              <p className="dashboard-kicker">IRR stream</p>
              <h3 className="mt-1 whitespace-nowrap text-sm font-semibold text-slate-100 sm:text-base md:text-lg">Hold and exit assumptions</h3>
            </div>
          </div>
          {renderIrrTooltipControl('absolute right-3 top-3 z-10 sm:right-4 sm:top-4')}

          <div className="mt-3">
            <AssumptionsPanel
              assumptions={assumptions}
              onChange={onAssumptionsChange!}
              showTargetIrrInput={showTargetIrrInput}
              variant="embedded"
              hideHeader
            />
          </div>
        </div>
      ) : null}

      {!showEmbeddedAssumptions ? (
        summaryVariant === 'compact' ? (
          <div className="dashboard-block mt-3 rounded-xl px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="dashboard-kicker">Internal rate of return assumptions</p>
            </div>
            <div className="dashboard-meta mt-2 flex flex-wrap gap-2 text-[11px]">
              {compactReferenceItems.map((item) => (
                <span key={item.label} className="dashboard-pill px-2 py-1">
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
        )
      ) : null}

      <div className="scrollbar-premium mt-3 grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {output.cashFlowTimeline.map((flow, index) => (
          <div key={index} className="dashboard-block rounded-lg p-2 text-sm">
            <p className="dashboard-meta text-xs">Year {index}</p>
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

  const stripTimelineContent = (
    <section className="dashboard-irr-strip min-w-0 overflow-hidden">
      <div className="dashboard-irr-strip-header flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex min-w-0 max-w-full items-center gap-1.5">
            <h3 className="truncate text-[0.96rem] font-semibold tracking-[0.02em] text-slate-50 sm:text-[1.04rem]">IRR stream</h3>
            {renderIrrTooltipControl('relative z-10 flex shrink-0 items-center')}
          </div>
        </div>
      </div>

      <div className="mt-2.5">
        {showEmbeddedAssumptions ? (
          <AssumptionsPanel
            assumptions={assumptions}
            onChange={onAssumptionsChange!}
            showTargetIrrInput={showTargetIrrInput}
            variant="inline"
            hideHeader
          />
        ) : (
          <div className="dashboard-meta flex flex-wrap gap-2 text-[11px]">
            {compactReferenceItems.map((item) => (
              <span key={item.label} className="dashboard-pill px-2 py-1">
                {item.label}: <span className="text-slate-100">{item.value}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="dashboard-section-divider mt-2.5 pt-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="dashboard-kicker">Projected annual cash flow</p>
          <p className="dashboard-meta text-[11px]">Years 0 through {Math.max(output.cashFlowTimeline.length - 1, 0)}</p>
        </div>
        <div className="scrollbar-premium mt-2 overflow-x-auto pb-1">
          <div className="dashboard-irr-strip-flow-row">
            {output.cashFlowTimeline.map((flow, index) => (
              <article key={index} className="dashboard-irr-flow-chip">
                <p className="dashboard-meta text-xs">Year {index}</p>
                <p
                  className={`mt-1 text-sm font-semibold ${flow >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}
                  style={getNegativeValueStyle(flow, { kind: 'currency' })}
                >
                  {currencyFormatter.format(flow)}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );

  if (isStrip) {
    return stripTimelineContent;
  }

  return (
    <section className="section-shell section-shell-projection min-w-0 max-w-full overflow-visible rounded-2xl p-3 shadow-soft sm:p-5">
      {collapsible ? (
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          className={`tap-feedback dashboard-block relative flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 rounded-xl px-3 py-2 pr-12 sm:pr-14 ${isExpanded ? 'mb-4' : 'mb-0'}`}
          onClick={() => setIsOpen((prev) => !prev)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            setIsOpen((prev) => !prev);
          }}
        >
          <div>
            <p className="dashboard-kicker">Cash flow timeline</p>
            <h3 className="text-lg font-semibold sm:text-xl">IRR Stream</h3>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start">
            <span className="dashboard-pill inline-flex h-7 min-w-7 items-center justify-center px-2 text-sm font-semibold transition-transform duration-200">
              {isExpanded ? '-' : '+'}
            </span>
          </div>
          {renderIrrTooltipControl('absolute right-3 top-2.5 z-10 sm:right-3 sm:top-3')}
        </div>
      ) : !showEmbeddedAssumptions ? (
        <div className="dashboard-block relative mb-4 rounded-xl px-3 py-2 pr-12 sm:pr-14">
          <div>
            <p className="dashboard-kicker">Cash flow timeline</p>
            <h3 className="text-lg font-semibold sm:text-xl">IRR Stream</h3>
          </div>
          {renderIrrTooltipControl('absolute right-3 top-2.5 z-10 sm:right-3 sm:top-3')}
        </div>
      ) : null}

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
    <article className="dashboard-block rounded-lg px-3 py-2">
      <p className="dashboard-meta text-xs">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </article>
  );
}
