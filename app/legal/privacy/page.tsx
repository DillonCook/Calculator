import Link from 'next/link';

const privacySections = [
  {
    title: '1. Data We Process',
    body: 'We process scenario inputs, calculation preferences, and technical telemetry required to run and improve the Service. In this version, saved scenarios are stored locally in your browser storage unless you explicitly share them.'
  },
  {
    title: '2. How We Use Data',
    body: 'We use data to deliver core calculations, persist your workflow, improve reliability, and prevent abuse. We do not sell your personal information.'
  },
  {
    title: '3. Shared Links and Exports',
    body: 'When you create a share link, deal data may be encoded into the URL. Anyone with the link can potentially access that data. Avoid including sensitive personal data in scenario fields.'
  },
  {
    title: '4. Cookies and Local Storage',
    body: 'The Service may rely on browser storage and essential cookies for functionality such as saved scenarios and settings. Disabling storage may limit app behavior.'
  },
  {
    title: '5. Data Retention',
    body: 'Local data remains on your device until deleted by you, your browser, or app controls. If cloud sync is introduced later, retention windows will be updated in this policy.'
  },
  {
    title: '6. Security',
    body: 'We implement reasonable safeguards, but no method of storage or transmission is fully secure. You should avoid storing highly sensitive data in this Service.'
  },
  {
    title: '7. Your Rights',
    body: 'Depending on your jurisdiction, you may have rights to access, correct, delete, or restrict processing of personal information. Contact details should be provided in your production deployment for rights requests.'
  },
  {
    title: '8. Policy Changes',
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
          <p className="text-xs text-muted">Effective date: February 19, 2026</p>
          <p className="text-sm text-muted">This policy explains what data is handled and how users can make informed sharing decisions.</p>
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
