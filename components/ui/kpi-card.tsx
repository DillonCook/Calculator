interface KpiCardProps {
  label: string;
  value: string;
  tone?: 'default' | 'success';
  helper?: string;
}

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function KpiCard({ label, value, helper, tone = 'default' }: KpiCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-panel p-4 shadow-soft">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`mt-2 text-3xl font-semibold md:text-4xl ${tone === 'success' ? 'text-emerald-300' : 'text-white'}`}
        data-testid={`kpi-${slugify(label)}`}
      >
        {value}
      </p>
      {helper ? <p className="mt-1 text-xs text-muted">{helper}</p> : null}
    </div>
  );
}
