import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MasterAssumptions, StrategyOutput } from '@/lib/models/deal';
import { currencyFormatter } from '@/lib/formatters';
import { getNegativeValueStyle } from '@/lib/negative-value-color';
import { useFloatingTooltipPosition } from '@/lib/use-floating-tooltip-position';

interface TimelineCardProps {
  output: StrategyOutput;
  assumptions: MasterAssumptions;
  onAssumptionsChange: (updates: Partial<MasterAssumptions>) => void;
  defaultOpen?: boolean;
}

export function TimelineCard({ output, assumptions, onAssumptionsChange, defaultOpen = true }: TimelineCardProps) {
  const [isIrrTooltipOpen, setIsIrrTooltipOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [holdYearsDraft, setHoldYearsDraft] = useState(String(assumptions.holdYears));
  const [isHoldYearsFocused, setIsHoldYearsFocused] = useState(false);
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

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);

  useEffect(() => {
    if (isHoldYearsFocused) return;
    setHoldYearsDraft(String(assumptions.holdYears));
  }, [assumptions.holdYears, isHoldYearsFocused]);

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

  return (
    <section className="min-w-0 max-w-full overflow-visible rounded-2xl panel-surface p-3 shadow-soft sm:p-5">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        className={`tap-feedback flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 ${isOpen ? 'mb-4' : 'mb-0'}`}
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
            {isOpen ? '-' : '+'}
          </span>
          <button
            ref={tooltipTriggerRef}
            type="button"
            aria-label="IRR stream explanation"
            aria-expanded={isIrrTooltipOpen}
            onClick={(event) => {
              event.stopPropagation();
              setIsIrrTooltipOpen((prev) => !prev);
            }}
            className="tap-feedback inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/[0.03] text-[10px] font-semibold text-muted opacity-85 transition hover:border-accent/70 hover:text-accent hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            i
          </button>

          {isIrrTooltipOpen && isMounted
            ? createPortal(
                <div
                  ref={tooltipPanelRef}
                  className="rounded-xl border border-[#304661] bg-[#0b1629] p-3 text-xs leading-relaxed text-slate-100 shadow-[0_12px_28px_rgba(3,10,20,0.68)]"
                  style={tooltipStyle}
                  onClick={(event) => event.stopPropagation()}
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
                    <span className="font-semibold text-white">Why IRR stream matters:</span> it captures the timing of every yearly cash flow and your exit proceeds,
                    so two deals with the same total profit can rank very differently. IRR helps you spot faster capital velocity and lower hold-time risk.
                  </p>
                </div>,
                document.body
              )
            : null}
        </div>
      </div>

      <div className="panel-collapse" data-open={isOpen}>
        <div className="panel-collapse-inner">
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className="text-xs text-muted">Hold years</span>
          <input
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus-visible:border-accent/75 focus-visible:shadow-[inset_0_0_0_1px_rgba(255,176,92,0.58)]"
            type="number"
            min={1}
            value={isHoldYearsFocused ? holdYearsDraft : assumptions.holdYears}
            onFocus={() => setIsHoldYearsFocused(true)}
            onChange={(event) => {
              const nextDraft = event.target.value;
              setHoldYearsDraft(nextDraft);
              if (nextDraft === '') return;
              onAssumptionsChange({ holdYears: Math.max(Number(nextDraft), 1) });
            }}
            onBlur={(event) => {
              setIsHoldYearsFocused(false);
              const nextRaw = event.target.value.trim();
              if (!nextRaw) {
                setHoldYearsDraft('1');
                onAssumptionsChange({ holdYears: 1 });
                return;
              }
              const normalized = Math.max(Number(nextRaw), 1);
              setHoldYearsDraft(String(normalized));
              onAssumptionsChange({ holdYears: normalized });
            }}
          />
        </label>

        <PercentField
          label="NOI growth %"
          value={assumptions.noiGrowthPercent}
          onChange={(value) => onAssumptionsChange({ noiGrowthPercent: value })}
        />
        <PercentField
          label="Appreciation %"
          value={assumptions.annualAppreciationPercent}
          onChange={(value) => onAssumptionsChange({ annualAppreciationPercent: value })}
        />
        <PercentField
          label="Selling cost %"
          value={assumptions.sellingCostPercent}
          onChange={(value) => onAssumptionsChange({ sellingCostPercent: value })}
        />
      </div>

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
        </div>
      </div>
    </section>
  );
}

function PercentField({ label, value, onChange }: { label: string; value: number; onChange: (next: number) => void }) {
  const [draftValue, setDraftValue] = useState(Number.isFinite(value) ? Number((value * 100).toFixed(2)).toString() : '0');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (isFocused) return;
    setDraftValue(Number.isFinite(value) ? Number((value * 100).toFixed(2)).toString() : '0');
  }, [value, isFocused]);

  return (
    <label className="space-y-1">
      <span className="text-xs text-muted">{label}</span>
      <input
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus-visible:border-accent/75 focus-visible:shadow-[inset_0_0_0_1px_rgba(255,176,92,0.58)]"
        type="number"
        value={isFocused ? draftValue : Number.isFinite(value) ? Number((value * 100).toFixed(2)) : 0}
        onFocus={() => setIsFocused(true)}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraftValue(nextDraft);
          if (nextDraft === '') return;
          onChange(Number(nextDraft) / 100);
        }}
        onBlur={(event) => {
          setIsFocused(false);
          if (event.target.value.trim() === '') {
            onChange(0);
            setDraftValue('0');
            return;
          }
          const nextValue = Number(event.target.value);
          if (Number.isFinite(nextValue)) {
            onChange(nextValue / 100);
            setDraftValue(nextValue.toString());
          }
        }}
      />
    </label>
  );
}
