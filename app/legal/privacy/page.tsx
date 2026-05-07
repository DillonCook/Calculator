import Link from 'next/link';

const privacySections = [
  {
    title: '1. Data We Process',
    body: 'Dillon Cook, doing business as DealCooker ("we", "us", or "our"), processes scenario inputs, calculation preferences, account identifiers, cloud sync records, share-link snapshots, deal-review requests, feedback submissions, product usage events, install-related events, and sanitized technical error logs required to run and improve the Service.'
  },
  {
    title: '2. How We Use Data',
    body: 'We use data to deliver core calculations, persist your workflow, understand feature usage, improve reliability, and prevent abuse. We do not sell your personal information.'
  },
  {
    title: '3. Shared Links and Exports',
    body: 'When you create a share link, a deal snapshot may be stored for link resolution and generally expires after 30 days. Anyone with the link can potentially access that snapshot. Avoid including sensitive personal data in scenario fields.'
  },
  {
    title: '4. Deal Review Requests',
    body: 'If you request a deal review, we use the deal snapshot, calculator inputs, contact details, notes, and market information you submit to evaluate the request and follow up. A licensed real estate broker or local review partner may receive the request when needed to respond.'
  },
  {
    title: '5. Cookies and Local Storage',
    body: 'The Service relies on browser storage, essential auth storage, and Supabase session handling for saved scenarios, settings, account access, and offline-friendly behavior. Disabling storage may limit app behavior.'
  },
  {
    title: '6. Data Retention',
    body: 'Local data remains on your device until deleted by you, your browser, or app controls. Cloud-synced scenarios remain associated with your account until deleted or until account-retention processes are applied. Error logs are retained only as long as operationally useful.'
  },
  {
    title: '7. Security',
    body: 'We implement reasonable safeguards including account-scoped storage and row-level access controls, but no method of storage or transmission is fully secure. You should avoid storing highly sensitive data in this Service.'
  },
  {
    title: '8. Your Rights',
    body: 'Depending on your jurisdiction, you may have rights to access, correct, delete, or restrict processing of personal information. You can contact Dillon Cook at dillon@theinvestoragent.io for privacy-related requests.'
  },
  {
    title: '9. Policy Changes',
    body: 'We may update this Privacy Policy from time to time. Material changes will be reflected by an updated effective date.'
  }
];

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0B1220] via-[#0F1B33] to-[#101B32] px-4 py-8 text-slate-100 md:px-8">
      <article className="mx-auto max-w-3xl space-y-5 rounded-2xl border border-white/10 bg-panel/80 p-5 shadow-soft backdrop-blur">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-accent">Legal</p>
          <h1 className="text-2xl font-semibold md:text-3xl">Privacy Policy</h1>
          <p className="text-xs text-muted">Effective date: May 7, 2026</p>
          <p className="text-sm text-muted">This policy explains how Dillon Cook, doing business as DealCooker, handles data and how users can make informed sharing decisions.</p>
        </div>

        <div className="space-y-4">
          {privacySections.map((section) => (
            <section key={section.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h2 className="text-base font-semibold">{section.title}</h2>
              <p className="mt-1 text-sm text-slate-300">{section.body}</p>
            </section>
          ))}
        </div>

        <Link href="/" className="inline-flex min-h-11 items-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/15">
          Back to Dashboard
        </Link>
      </article>
    </main>
  );
}
