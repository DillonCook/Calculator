'use client';

export function PrintActions() {
  return (
    <div className="mx-auto mt-4 flex max-w-4xl justify-end print:hidden">
      <button
        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-700"
        onClick={() => window.print()}
        type="button"
      >
        Print / Save PDF
      </button>
    </div>
  );
}
