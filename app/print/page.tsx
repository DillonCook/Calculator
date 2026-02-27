import { PrintActions } from '@/components/print/print-actions';
import { calculateDeal } from '@/lib/engine/deal-engine';
import { createPdfReportSchema } from '@/lib/export/pdf-schema';
import { decodeScenario } from '@/lib/scenario-storage';
import { defaultDealInput, type StrategyKey } from '@/lib/models/deal';

interface PrintPageProps {
  searchParams: Promise<{ scenario?: string; strategy?: string }>;
}

const printableStrategies: StrategyKey[] = ['purchase', 'longTerm', 'airbnb', 'padSplit', 'brrrr', 'flip'];

const parseStrategy = (value?: string): StrategyKey => {
  if (!value) return 'purchase';
  return printableStrategies.includes(value as StrategyKey) ? (value as StrategyKey) : 'purchase';
};

export default async function PrintPage({ searchParams }: PrintPageProps) {
  const params = await searchParams;
  const decoded = params.scenario ? decodeScenario(params.scenario) : null;
  const model = decoded?.payload ?? defaultDealInput;
  const strategy = parseStrategy(params.strategy);
  const result = calculateDeal(model);
  const report = createPdfReportSchema(model, result, strategy);

  return (
    <main className="print-shell min-h-screen bg-surface px-3 py-4 sm:px-6 print:bg-white print:p-0">
      <PrintActions />

      <article className="print-report mx-auto max-w-4xl overflow-hidden rounded-2xl border border-slate-700 bg-white text-slate-900 shadow-2xl print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <header className="border-b border-white/10 bg-gradient-to-br from-[#0B1220] via-[#0F1B33] to-[#101B32] px-5 py-5 text-white sm:px-8">
          <p className="text-xs uppercase tracking-[0.2em] text-accent">Deal Report</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{report.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">{report.subtitle}</p>
          <div className="mt-4 grid gap-2 text-sm text-muted sm:grid-cols-3">
            <InfoPill label="Deal" value={report.dealName} />
            <InfoPill label="Strategy" value={report.selectedStrategyLabel} />
            <InfoPill label="Generated" value={new Date(report.generatedAt).toLocaleString()} />
          </div>
        </header>

        <section className="grid gap-4 px-4 py-5 sm:grid-cols-2 sm:px-8">
          <MetricCard label="Cash to Close" value={report.summary.rows[1]?.value ?? '-'} />
          <MetricCard label="Cash-on-Cash" value={report.summary.rows[4]?.value ?? '-'} />
          <MetricCard label="Cap Rate" value={report.summary.rows[3]?.value ?? '-'} />
          <MetricCard label="DSCR" value={report.summary.rows[5]?.value ?? '-'} />
        </section>

        <div className="space-y-5 px-4 pb-8 sm:px-8">
          <ReportSection title={report.summary.title} rows={report.summary.rows} />
          <ReportSection title={report.strategyHighlights.title} rows={report.strategyHighlights.rows} />
          <ReportSection title={report.underwritingWork.title} rows={report.underwritingWork.rows} />
          <ReportSection title={report.taxAndInsuranceDetail.title} rows={report.taxAndInsuranceDetail.rows} />
          <ReportSection title={report.variableExpenseDetail.title} rows={report.variableExpenseDetail.rows} />
          <ReportSection title={report.financingSnapshot.title} rows={report.financingSnapshot.rows} />
          <ReportSection title={report.assumptions.title} rows={report.assumptions.rows} />
          <ReportSection title={report.listingReference.title} rows={report.listingReference.rows} />
        </div>
      </article>
    </main>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="truncate text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function ReportSection({ title, rows }: { title: string; rows: { label: string; value: string; href?: string }[] }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold text-slate-900 sm:text-lg">{title}</h2>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-0 sm:px-4 sm:py-3">
            <span className="text-slate-600">{row.label}</span>
            {row.href ? (
              <a className="max-w-[60%] truncate text-right font-semibold text-blue-700 underline decoration-blue-400 underline-offset-2" href={row.href} target="_blank" rel="noreferrer">
                {row.value}
              </a>
            ) : (
              <span className="text-right font-semibold text-slate-900">{row.value}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
