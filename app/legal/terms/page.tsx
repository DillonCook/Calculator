import Link from 'next/link';

const sections = [
  {
    title: '1. Acceptance of Terms',
    body: 'By accessing or using DealCooker (the "Service"), you agree to be bound by these Terms of Use with Dillon Cook, doing business as DealCooker ("we", "us", or "our"). If you do not agree, do not use the Service.'
  },
  {
    title: '2. Ownership and Intellectual Property',
    body: 'The Service, including its code, content, design, calculations, branding, documentation, and related materials, is owned by Dillon Cook and operated under the DealCooker brand. The Service is protected by applicable intellectual property laws. Unauthorized copying, resale, redistribution, reverse engineering, scraping, or derivative use is prohibited unless explicitly permitted in writing.'
  },
  {
    title: '3. No Financial, Legal, or Tax Advice',
    body: 'The Service provides analytical estimates for educational and informational purposes only. It does not constitute financial, legal, accounting, or tax advice. You are solely responsible for independent diligence and consulting qualified professionals before making decisions.'
  },
  {
    title: '4. User Responsibilities',
    body: 'You agree to provide accurate input data, comply with all applicable laws, and refrain from attempting to disrupt or abuse the Service. You are responsible for your account security, devices, and any exported or shared data.'
  },
  {
    title: '5. Disclaimer of Warranties',
    body: 'The Service is provided "as is" and "as available" without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, non-infringement, availability, or accuracy of projections.'
  },
  {
    title: '6. Limitation of Liability',
    body: 'To the fullest extent permitted by law, Dillon Cook shall not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenue, data, goodwill, or business opportunities arising from your use of the Service.'
  },
  {
    title: '7. Indemnification',
    body: 'You agree to defend, indemnify, and hold harmless Dillon Cook from claims, liabilities, damages, and expenses arising from your use of the Service, violation of these Terms, or violation of law.'
  },
  {
    title: '8. Feedback',
    body: 'If you submit feedback, suggestions, bug reports, or ideas, you grant Dillon Cook the right to use them to improve, modify, market, operate, or support the Service without compensation or obligation to you.'
  },
  {
    title: '9. Termination',
    body: 'We may suspend or terminate access to the Service at any time for misuse, legal risk, or operational reasons. Sections intended to survive termination remain effective.'
  },
  {
    title: '10. Governing Law',
    body: 'These Terms are governed by applicable law in your operating jurisdiction, unless superseded by mandatory consumer protections.'
  },
  {
    title: '11. Updates to Terms',
    body: 'We may revise these Terms from time to time. Continued use after updates means you accept the revised Terms.'
  }
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0B1220] via-[#0F1B33] to-[#101B32] px-4 py-8 text-slate-100 md:px-8">
      <article className="mx-auto max-w-3xl space-y-5 rounded-2xl border border-white/10 bg-panel/80 p-5 shadow-soft backdrop-blur">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-accent">Legal</p>
          <h1 className="text-2xl font-semibold md:text-3xl">Terms of Use</h1>
          <p className="text-xs text-muted">Effective date: April 29, 2026</p>
          <p className="text-sm text-muted">These terms help protect DealCooker, its owner, and the intellectual property behind the Service while setting clear user expectations.</p>
        </div>

        <div className="space-y-4">
          {sections.map((section) => (
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
