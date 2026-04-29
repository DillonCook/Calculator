import Link from 'next/link';

export default function LegalHubPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0B1220] via-[#0F1B33] to-[#101B32] px-4 py-8 text-slate-100 md:px-8">
      <div className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-white/10 bg-panel/80 p-5 shadow-soft backdrop-blur">
        <p className="text-xs uppercase tracking-[0.18em] text-accent">Legal</p>
        <h1 className="text-2xl font-semibold md:text-3xl">DealCooker Legal Center</h1>
        <p className="text-sm text-muted">
          Core legal documents for use of this product. These pages are not legal advice and should be reviewed with your attorney.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/legal/terms" className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium hover:bg-white/10">
            Terms of Use
          </Link>
          <Link href="/legal/privacy" className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium hover:bg-white/10">
            Privacy Policy
          </Link>
        </div>
      </div>
    </main>
  );
}
