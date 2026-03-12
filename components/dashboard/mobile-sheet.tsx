'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface MobileSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function MobileSheet({ open, title, onClose, children }: MobileSheetProps) {
  useEffect(() => {
    if (!open) return;

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
  }, [onClose, open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[180] overflow-y-auto bg-[#040814]/72 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div className="flex min-h-full items-end justify-center lg:px-6 lg:py-8">
        <div
          className="flex max-h-[min(88dvh,960px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-[1.75rem] border border-white/10 bg-surface shadow-soft lg:rounded-3xl"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sticky top-0 z-10 border-b border-white/10 bg-surface/95 px-4 pb-3 pt-3 backdrop-blur">
            <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-white/15 lg:hidden" aria-hidden="true" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-accent">Mobile workspace</p>
                <h2 className="mt-1 text-base font-semibold text-slate-100 sm:text-lg">{title}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
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
