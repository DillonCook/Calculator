import type { Metadata } from 'next';

import { PrintActions } from '@/components/print/print-actions';
import { calculateDeal } from '@/lib/engine/deal-engine';
import { createPdfReportSchema, type PdfReportRow } from '@/lib/export/pdf-schema';
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

const readRowValue = (rows: PdfReportRow[], label: string, fallback = '-'): string => {
  return rows.find((row) => row.label === label)?.value ?? fallback;
};

const splitRows = (rows: PdfReportRow[], columns = 2) => {
  if (rows.length === 0) return [];
  const perColumn = Math.ceil(rows.length / columns);
  return Array.from({ length: columns }, (_, index) => rows.slice(index * perColumn, (index + 1) * perColumn)).filter((col) => col.length > 0);
};

const buildPrintDocumentTitle = (dealName: string | undefined) => {
  const normalizedDealName = dealName?.trim();
  return normalizedDealName ? `${normalizedDealName}- Dealcooker` : 'Dealcooker';
};

export async function generateMetadata({ searchParams }: PrintPageProps): Promise<Metadata> {
  const params = await searchParams;
  const decoded = params.scenario ? decodeScenario(params.scenario) : null;
  return {
    title: buildPrintDocumentTitle(decoded?.payload.purchase.dealName)
  };
}

export default async function PrintPage({ searchParams }: PrintPageProps) {
  const params = await searchParams;
  const decoded = params.scenario ? decodeScenario(params.scenario) : null;
  const model = decoded?.payload ?? defaultDealInput;
  const strategy = parseStrategy(params.strategy);
  const result = calculateDeal(model);
  const report = createPdfReportSchema(model, result, strategy);
  const primaryMetricLabel = report.strategyHighlights.rows[0]?.label ?? 'Primary Metric';
  const primaryMetricValue = report.strategyHighlights.rows[0]?.value ?? '-';
  const headlineMetrics = [
    { label: 'Cash to Close', value: readRowValue(report.summary.rows, 'Cash to Close') },
    { label: 'Total Cash Invested', value: readRowValue(report.summary.rows, 'Total Cash Invested') },
    { label: primaryMetricLabel, value: primaryMetricValue },
    { label: 'ROI', value: readRowValue(report.strategyHighlights.rows, 'ROI') },
    { label: 'IRR', value: readRowValue(report.strategyHighlights.rows, 'IRR') },
    { label: 'DSCR', value: readRowValue(report.summary.rows, 'DSCR') }
  ];
  const printDocumentTitle = buildPrintDocumentTitle(report.dealName);

  return (
    <main className="print-shell min-h-screen bg-surface px-3 py-4 sm:px-6 print:bg-white print:p-0">
      <PrintActions documentTitle={printDocumentTitle} />

      <article className="print-report mx-auto max-w-5xl overflow-hidden rounded-2xl border text-slate-900 shadow-2xl print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <header className="print-report-header px-4 py-4 sm:px-6 print:px-4 print:py-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] print:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <h1 className="text-2xl font-semibold leading-tight text-slate-900 sm:text-[1.7rem]">{report.title}</h1>
              <p className="mt-1 max-w-3xl text-[13px] leading-snug text-slate-600">{report.subtitle}</p>
            </div>
            <div className="grid gap-1 text-[11px] text-slate-700 print:text-[10px]">
              <MetaChip label="Deal" value={report.dealName} />
              <MetaChip label="Strategy" value={report.selectedStrategyLabel} />
              <MetaChip label="Generated" value={new Date(report.generatedAt).toLocaleString()} />
            </div>
          </div>

          <section className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3 print:grid-cols-3 print:gap-1.5">
            {headlineMetrics.map((metric) => (
              <MetricCard key={metric.label} label={metric.label} value={metric.value} />
            ))}
          </section>
        </header>

        <div className="px-3 py-3 sm:px-5 sm:py-4 print:px-3 print:py-3">
          <div className="print-tight-grid grid gap-3 lg:grid-cols-2 print:grid-cols-2">
            <ReportSectionCard title={report.summary.title} rows={report.summary.rows} />
            <ReportSectionCard title={report.strategyHighlights.title} rows={report.strategyHighlights.rows} />
            <ReportSectionCard title={report.financingSnapshot.title} rows={report.financingSnapshot.rows} />
            <ReportSectionCard title={report.assumptions.title} rows={report.assumptions.rows} />
            <ReportSectionCard title={report.taxAndInsuranceDetail.title} rows={report.taxAndInsuranceDetail.rows} />
            <ReportSectionCard title={report.variableExpenseDetail.title} rows={report.variableExpenseDetail.rows} twoColumnRows />
            {report.turnaroundStabilization ? (
              <ReportSectionCard
                className="lg:col-span-2 print:col-span-2"
                title={report.turnaroundStabilization.title}
                rows={report.turnaroundStabilization.rows}
                twoColumnRows
              />
            ) : null}
            <ReportSectionCard className="lg:col-span-2 print:col-span-2" title={report.underwritingWork.title} rows={report.underwritingWork.rows} twoColumnRows />
            <ReportSectionCard className="lg:col-span-2 print:col-span-2" title={report.listingReference.title} rows={report.listingReference.rows} />
          </div>
        </div>
      </article>
    </main>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="print-meta-chip rounded-md border px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="max-w-[30ch] truncate text-[11px] font-semibold text-slate-900 print:max-w-[26ch]">{value}</p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="print-metric-card rounded-lg border px-2.5 py-2 print:shadow-none">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-semibold leading-tight text-slate-900 sm:text-lg print:text-[13px]">{value}</p>
    </div>
  );
}

function ReportSectionCard({
  title,
  rows,
  twoColumnRows = false,
  className
}: {
  title: string;
  rows: PdfReportRow[];
  twoColumnRows?: boolean;
  className?: string;
}) {
  const columns = twoColumnRows && rows.length >= 8 ? splitRows(rows, 2) : [rows];

  return (
    <section className={`print-section-card break-inside-avoid ${className ?? ''}`}>
      <h2 className="mb-1.5 text-[13px] font-semibold text-slate-900 sm:text-[15px]">{title}</h2>
      <div className={`grid gap-2 ${columns.length > 1 ? 'md:grid-cols-2 print:grid-cols-2' : ''}`}>
        {columns.map((columnRows, columnIndex) => (
          <div key={`${title}-col-${columnIndex}`} className="print-section-box">
            {columnRows.map((row, rowIndex) => (
              <div
                key={`${row.label}-${rowIndex}`}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-2.5 py-1.5 text-[11px] leading-snug sm:px-3 ${
                  rowIndex < columnRows.length - 1 ? 'border-b border-slate-100' : ''
                }`}
              >
                <span className="text-slate-600">{row.label}</span>
                {row.href ? (
                  <a
                    className="print-link max-w-[26ch] truncate text-right font-semibold underline underline-offset-2 print:max-w-[24ch]"
                    href={row.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {row.value}
                  </a>
                ) : (
                  <span className="text-right font-semibold text-slate-900">{row.value}</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
