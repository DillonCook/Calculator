'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { triggerHapticFeedback } from '@/lib/use-haptics';

const SHEET_ANIMATION_MS = 320;
const DISMISS_DRAG_THRESHOLD = 120;
const DISMISS_VELOCITY_THRESHOLD = 0.65;

interface DragState {
  pointerId: number;
  startY: number;
  startTime: number;
}

interface MobileSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function MobileSheet({ open, title, onClose, children }: MobileSheetProps) {
  const [isMounted, setIsMounted] = useState(open);
  const [isVisible, setIsVisible] = useState(open);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);
  const enterFrameRef = useRef<number | null>(null);
  const dragStateRef = useRef<DragState | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
      if (enterFrameRef.current) window.cancelAnimationFrame(enterFrameRef.current);
    };
  }, []);

  useEffect(() => {
    if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    if (enterFrameRef.current) window.cancelAnimationFrame(enterFrameRef.current);

    if (open) {
      setIsMounted(true);
      enterFrameRef.current = window.requestAnimationFrame(() => setIsVisible(true));
      return;
    }

    setIsVisible(false);
    setIsDragging(false);
    setDragOffset(0);
    dragStateRef.current = null;

    if (!isMounted) return;

    closeTimeoutRef.current = window.setTimeout(() => setIsMounted(false), SHEET_ANIMATION_MS);
  }, [isMounted, open]);

  useEffect(() => {
    if (!isMounted) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMounted, onClose]);

  if (!isMounted || typeof document === 'undefined') return null;

  const completeDragDismiss = () => {
    setIsDragging(false);
    setDragOffset(0);
    dragStateRef.current = null;
    triggerHapticFeedback('medium');
    onClose();
  };

  const resetDrag = () => {
    setIsDragging(false);
    setDragOffset(0);
    dragStateRef.current = null;
  };

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTime: performance.now()
    };
    setIsDragging(true);
    setDragOffset(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const nextOffset = Math.max(event.clientY - dragState.startY, 0);
    setDragOffset(nextOffset);
  };

  const handleDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const dragDistance = Math.max(event.clientY - dragState.startY, 0);
    const elapsed = Math.max(performance.now() - dragState.startTime, 1);
    const velocity = dragDistance / elapsed;

    if (dragDistance >= DISMISS_DRAG_THRESHOLD || (dragDistance >= 48 && velocity >= DISMISS_VELOCITY_THRESHOLD)) {
      completeDragDismiss();
      return;
    }

    resetDrag();
  };

  const handleDragCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resetDrag();
  };

  const panelStyle = {
    paddingBottom: 'max(env(safe-area-inset-bottom), 0px)',
    ['--sheet-offset' as string]: `${dragOffset}px`
  } as CSSProperties;
  const backdropStyle = isDragging
    ? ({
        opacity: Math.max(0.56, 1 - dragOffset / 240)
      } as CSSProperties)
    : undefined;

  return createPortal(
    <div
      className="fixed inset-0 z-[180] overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Close ${title}`}
        className="mobile-sheet-backdrop absolute inset-0 m-0 border-0 bg-[#040814]/72 p-0 backdrop-blur-sm"
        data-open={isVisible ? 'true' : 'false'}
        style={backdropStyle}
        onClick={() => {
          triggerHapticFeedback('light');
          onClose();
        }}
      />
      <div className="pointer-events-none relative flex min-h-full items-end justify-center overflow-y-auto lg:px-6 lg:py-8">
        <div
          className="mobile-sheet-panel pointer-events-auto flex max-h-[min(88dvh,960px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-[1.75rem] border border-white/10 bg-surface shadow-soft lg:rounded-3xl"
          data-open={isVisible ? 'true' : 'false'}
          data-dragging={isDragging ? 'true' : 'false'}
          style={panelStyle}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sticky top-0 z-10 border-b border-white/10 bg-surface/95 px-4 pb-3 pt-3 backdrop-blur">
            <div
              className="mobile-sheet-grab-zone -mx-4 -mt-3 mb-2 flex min-h-12 items-center justify-center px-4 pt-2 pb-3 lg:hidden touch-none select-none"
              role="presentation"
              aria-hidden="true"
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragCancel}
            >
              <div className="mobile-sheet-handle h-2 w-20 rounded-full bg-white/15" />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent sm:text-xs">{title}</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHapticFeedback('light');
                  onClose();
                }}
                className="tap-feedback inline-flex min-h-9 items-center rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>

          <div
            className="scrollbar-premium min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 pt-4 touch-pan-y sm:px-5"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
