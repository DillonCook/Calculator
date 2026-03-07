'use client';

import { useEffect, useMemo, useState } from 'react';

interface PrintActionsProps {
  documentTitle?: string;
}

export function PrintActions({ documentTitle }: PrintActionsProps) {
  const [copyFeedback, setCopyFeedback] = useState<'idle' | 'copied' | 'failed'>('idle');

  const editableUrl = useMemo(() => {
    if (typeof window === 'undefined') return null;

    const params = new URLSearchParams(window.location.search);
    const scenario = params.get('scenario');
    if (!scenario) return null;

    const editableParams = new URLSearchParams();
    editableParams.set('s', scenario);
    return `${window.location.origin}/?${editableParams.toString()}`;
  }, []);

  useEffect(() => {
    if (!documentTitle) return;

    const previousTitle = document.title;
    document.title = documentTitle;

    return () => {
      document.title = previousTitle;
    };
  }, [documentTitle]);

  const copyEditableLink = async () => {
    if (!editableUrl) return;
    try {
      await navigator.clipboard.writeText(editableUrl);
      setCopyFeedback('copied');
    } catch {
      setCopyFeedback('failed');
    }
  };

  return (
    <div className="mx-auto mb-4 flex w-full max-w-4xl flex-wrap items-center justify-end gap-2 sm:mb-5 print:hidden">
      {editableUrl ? (
        <>
          <a
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            href={editableUrl}
          >
            Open Editable Report
          </a>
          <button
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            onClick={copyEditableLink}
            type="button"
          >
            Copy Shareable Link
          </button>
        </>
      ) : null}
      <button
        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        onClick={() => window.print()}
        type="button"
      >
        Print / Save PDF
      </button>
      {copyFeedback === 'copied' ? <span className="text-xs text-emerald-600">Shareable editable link copied.</span> : null}
      {copyFeedback === 'failed' ? <span className="text-xs text-rose-600">Could not copy link.</span> : null}
    </div>
  );
}
