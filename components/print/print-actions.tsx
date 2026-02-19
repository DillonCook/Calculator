'use client';

export function PrintActions() {
  return (
    <div className="mx-auto mb-4 flex w-full max-w-4xl justify-end print:hidden">
      <button
        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        onClick={() => window.print()}
        type="button"
      >
        Print / Save PDF
      </button>
    </div>
  );
}
