'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface OnboardingStep {
  id: string;
  title: string;
  body: string;
}

interface OnboardingTourProps {
  open: boolean;
  steps: OnboardingStep[];
  stepIndex: number;
  layoutKey?: string;
  getTargetElement: () => HTMLElement | null;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

interface BubbleLayout {
  top: number;
  left: number;
  width: number;
  arrowLeft: number;
  placement: 'above' | 'below';
}

interface TargetLayoutRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const screenPadding = 12;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const isRectOutsideViewport = (rect: DOMRect) =>
  rect.bottom < screenPadding ||
  rect.top > window.innerHeight - screenPadding ||
  rect.right < screenPadding ||
  rect.left > window.innerWidth - screenPadding;
const toLayoutRect = (rect: DOMRect): TargetLayoutRect => ({
  top: rect.top,
  left: rect.left,
  right: rect.right,
  bottom: rect.bottom,
  width: rect.width,
  height: rect.height
});

export function OnboardingTour({ open, steps, stepIndex, layoutKey, getTargetElement, onBack, onNext, onSkip }: OnboardingTourProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const autoScrolledTargetKeyRef = useRef<string | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [targetRect, setTargetRect] = useState<TargetLayoutRect | null>(null);
  const [bubbleLayout, setBubbleLayout] = useState<BubbleLayout | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    if (!open) return;

    let pendingFrame: number | null = null;
    const targetKey = `${stepIndex}:${layoutKey ?? ''}`;

    const updateLayout = () => {
      const target = getTargetElement();
      const bubbleWidth = Math.min(window.innerWidth - screenPadding * 2, 344);
      const panelHeight = panelRef.current?.getBoundingClientRect().height ?? 220;

      if (!target) {
        setTargetRect(null);
        setBubbleLayout({
          width: bubbleWidth,
          left: clamp((window.innerWidth - bubbleWidth) / 2, screenPadding, window.innerWidth - bubbleWidth - screenPadding),
          top: clamp(window.innerHeight - panelHeight - screenPadding, screenPadding, window.innerHeight - panelHeight - screenPadding),
          arrowLeft: bubbleWidth / 2 - 10,
          placement: 'above'
        });
        return;
      }

      const measuredRect = target.getBoundingClientRect();
      if (isRectOutsideViewport(measuredRect) && autoScrolledTargetKeyRef.current !== targetKey) {
        autoScrolledTargetKeyRef.current = targetKey;
        target.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
      }

      const rect = toLayoutRect(target.getBoundingClientRect());
      setTargetRect(rect);

      const shouldPlaceAbove = window.innerHeight - rect.bottom < panelHeight + 40 && rect.top > panelHeight + 40;
      const left = clamp(rect.left + rect.width / 2 - bubbleWidth / 2, screenPadding, window.innerWidth - bubbleWidth - screenPadding);
      const top = shouldPlaceAbove
        ? clamp(rect.top - panelHeight - 14, screenPadding, window.innerHeight - panelHeight - screenPadding)
        : clamp(rect.bottom + 14, screenPadding, window.innerHeight - panelHeight - screenPadding);
      const arrowLeft = clamp(rect.left + rect.width / 2 - left - 10, 16, bubbleWidth - 28);

      setBubbleLayout({
        width: bubbleWidth,
        left,
        top,
        arrowLeft,
        placement: shouldPlaceAbove ? 'above' : 'below'
      });
    };
    const scheduleLayoutUpdate = () => {
      if (pendingFrame !== null) return;

      pendingFrame = window.requestAnimationFrame(() => {
        pendingFrame = null;
        updateLayout();
      });
    };

    autoScrolledTargetKeyRef.current = null;
    scheduleLayoutUpdate();

    const visualViewport = window.visualViewport;
    window.addEventListener('resize', scheduleLayoutUpdate);
    window.addEventListener('scroll', scheduleLayoutUpdate, { capture: true, passive: true });
    visualViewport?.addEventListener('resize', scheduleLayoutUpdate);
    visualViewport?.addEventListener('scroll', scheduleLayoutUpdate);

    return () => {
      if (pendingFrame !== null) {
        window.cancelAnimationFrame(pendingFrame);
      }
      window.removeEventListener('resize', scheduleLayoutUpdate);
      window.removeEventListener('scroll', scheduleLayoutUpdate, true);
      visualViewport?.removeEventListener('resize', scheduleLayoutUpdate);
      visualViewport?.removeEventListener('scroll', scheduleLayoutUpdate);
    };
  }, [open, stepIndex, layoutKey, getTargetElement]);

  if (!open || !steps[stepIndex] || !bubbleLayout || !portalTarget) return null;

  const step = steps[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === steps.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[260]" role="dialog" aria-modal="true" aria-label="Quick app tutorial">
      <div className="absolute inset-0 bg-[#020713]/72 backdrop-blur-[1px]" />

      {targetRect ? (
        <div
          className="pointer-events-none absolute rounded-2xl border-[3px] border-[#8fdcff] shadow-[0_0_0_2px_rgba(68,168,255,0.25),0_0_28px_rgba(73,186,255,0.48)] transition-all duration-300"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12
          }}
        />
      ) : null}

      <div
        ref={panelRef}
        className="absolute rounded-[22px] border-2 border-[#8fdcff] bg-[linear-gradient(150deg,#0f2945_0%,#163a63_55%,#1a456f_100%)] p-4 text-slate-100 shadow-[0_20px_40px_rgba(2,8,20,0.72)] transition-all duration-300"
        style={{
          top: bubbleLayout.top,
          left: bubbleLayout.left,
          width: bubbleLayout.width
        }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#89e0ff]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#8cb8ff]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#b8d1ff]" />
          </div>
          <button type="button" onClick={onSkip} className="text-[11px] font-medium text-slate-200/90 underline underline-offset-2">
            Skip tutorial
          </button>
        </div>

        <p className="text-[11px] uppercase tracking-[0.12em] text-[#b9ebff]">Quick Tour {stepIndex + 1}/{steps.length}</p>
        <p className="mt-1 text-base font-semibold text-white">{step.title}</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-100/95">{step.body}</p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={isFirstStep}
            className="rounded-lg border border-white/25 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back
          </button>
          <button type="button" onClick={onNext} className="btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold">
            {isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>

        <div
          className="absolute h-4 w-4 rotate-45 border-[#8fdcff] bg-[#163a63]"
          style={
            bubbleLayout.placement === 'below'
              ? {
                  top: -9,
                  left: bubbleLayout.arrowLeft,
                  borderTopWidth: 2,
                  borderLeftWidth: 2
                }
              : {
                  bottom: -9,
                  left: bubbleLayout.arrowLeft,
                  borderBottomWidth: 2,
                  borderRightWidth: 2
                }
          }
        />
      </div>
    </div>,
    portalTarget
  );
}
