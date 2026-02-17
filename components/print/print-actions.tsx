'use client';

export function PrintActions() {
  return (
    <div className="mt-6 print:hidden">
      <button className="rounded bg-black px-4 py-2 text-sm font-semibold text-white" onClick={() => window.print()} type="button">
        Print / Save PDF
      </button>
    </div>
  );
}
