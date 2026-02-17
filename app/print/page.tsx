import { PrintActions } from '@/components/print/print-actions';
import { calculateDeal } from '@/lib/engine/deal-engine';
import { createPdfReportSchema } from '@/lib/export/pdf-schema';
import { decodeScenario } from '@/lib/scenario-storage';
import { defaultDealInput } from '@/lib/models/deal';

interface PrintPageProps {
  searchParams: Promise<{ scenario?: string }>;
}

export default async function PrintPage({ searchParams }: PrintPageProps) {
  const params = await searchParams;
  const decoded = params.scenario ? decodeScenario(params.scenario) : null;
  const model = decoded?.payload ?? defaultDealInput;
  const result = calculateDeal(model);
  const report = createPdfReportSchema(model, result);

  return (
    <main className="mx-auto max-w-4xl bg-white px-6 py-8 text-black print:p-4">
      <header className="border-b border-gray-300 pb-4">
        <h1 className="text-2xl font-bold">{report.title}</h1>
        <p className="text-sm text-gray-600">Deal: {report.dealName}</p>
        <p className="text-sm text-gray-600">Generated: {new Date(report.generatedAt).toLocaleString()}</p>
      </header>

      <ReportSection title={report.summary.title} rows={report.summary.rows} />
      <ReportSection title={report.assumptions.title} rows={report.assumptions.rows} />
      {report.strategySections.map((section) => (
        <ReportSection key={section.title} title={section.title} rows={section.rows} />
      ))}

      <PrintActions />
    </main>
  );
}

function ReportSection({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <div className="overflow-hidden rounded border border-gray-300">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between border-b border-gray-200 px-3 py-2 text-sm last:border-0">
            <span className="text-gray-700">{row.label}</span>
            <span className="font-medium">{row.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
