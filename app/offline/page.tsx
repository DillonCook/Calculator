import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-lg rounded-2xl border border-white/15 bg-surface/80 p-6 shadow-soft backdrop-blur">
        <p className="text-xs uppercase tracking-[0.16em] text-accent">Offline mode</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-100">You are currently offline</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          DealCooker is installed and ready for offline sessions. Reconnect to sync cloud scenarios and fetch fresh share links.
        </p>
        <Link
          href="/"
          className="btn-primary btn-work mt-5 inline-flex min-h-10 items-center justify-center rounded-xl px-4 py-2 text-sm font-medium"
        >
          Open dashboard
        </Link>
      </section>
    </main>
  );
}
