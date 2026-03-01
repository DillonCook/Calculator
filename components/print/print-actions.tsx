'use client';

import { useEffect } from 'react';

interface PrintActionsProps {
  documentTitle?: string;
}

export function PrintActions({ documentTitle }: PrintActionsProps) {
  useEffect(() => {
    if (!documentTitle) return;

    const previousTitle = document.title;
    document.title = documentTitle;

    return () => {
      document.title = previousTitle;
    };
  }, [documentTitle]);

  return (
    <div className="mx-auto mb-4 flex w-full max-w-4xl justify-end sm:mb-5 print:hidden">
      <button
        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        onClick={() => window.print()}
        type="button"
      >
        Print / Save PDF
      </button>
    </div>
  );
}
