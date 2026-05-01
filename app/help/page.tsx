import Link from 'next/link';

const supportEmail = 'dillon@theinvestoragent.io';
const releaseLabel = process.env.NEXT_PUBLIC_APP_RELEASE ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'Open testing';

const methodologySections = [
  {
    title: 'How DealCooker Works',
    body: 'DealCooker turns your deal inputs into strategy-specific projections for cash needed, monthly performance, return metrics, debt coverage, and exit assumptions. The numbers are only as reliable as the assumptions entered.'
  },
  {
    title: 'Projection Limits',
    body: 'Outputs are estimates for screening and comparison. They are not financial, legal, tax, lending, appraisal, or investment advice. Confirm rents, expenses, financing, taxes, insurance, zoning, and exit values independently before acting.'
  },
  {
    title: 'Saved Deals and Sharing',
    body: 'Signed-in users can sync saved deals to the cloud. Share links and printed reports may include the deal assumptions used to create them, so avoid adding private notes or sensitive personal data to deal fields.'
  },
  {
    title: 'Open Testing Support',
    body: 'Use Send feedback in Settings when something feels confusing, broken, or missing. Feedback includes your signed-in account contact info automatically so Dillon can follow up.'
  },
  {
    title: 'Open Testing Status',
    body: 'DealCooker is currently open for testing without paid tiers or billing gates. Features, wording, and calculations may change as feedback comes in, so keep your own backup of important underwriting work.'
  }
];

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0B1220] via-[#0F1B33] to-[#101B32] px-4 py-8 text-slate-100 md:px-8">
      <article className="mx-auto max-w-3xl space-y-5">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-accent">Help</p>
          <h1 className="text-2xl font-semibold md:text-3xl">Help & Methodology</h1>
          <p className="text-sm text-muted">
            Practical context for using DealCooker during open testing, understanding the reports, and getting support.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <a href={`mailto:${supportEmail}`} className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium hover:bg-white/10">
            Contact support
          </a>
          <Link href="/legal" className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium hover:bg-white/10">
            Legal center
          </Link>
        </div>

        <div className="space-y-4">
          {methodologySections.map((section) => (
            <section key={section.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h2 className="text-base font-semibold">{section.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-300">{section.body}</p>
            </section>
          ))}
        </div>

        <section className="rounded-xl border border-accent/20 bg-accent/10 p-4">
          <h2 className="text-base font-semibold text-accent">Retail-readiness focus</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-200">
            The current open-testing goal is dependable solo-investor underwriting: account-safe deal storage, clear assumptions, branded share/print outputs, and direct feedback when the workflow is unclear.
          </p>
          <p className="mt-2 text-xs text-muted">Release: {releaseLabel}</p>
        </section>

        <Link href="/" className="inline-flex min-h-11 items-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/15">
          Back to Dashboard
        </Link>
      </article>
    </main>
  );
}
