'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import { trackAnalyticsEvent } from '@/lib/analytics';
import { type StrategyKey } from '@/lib/models/deal';
import { createScenarioRecord, encodeScenario } from '@/lib/scenario-storage';
import { fetchShareBySlug } from '@/lib/share-links';

const printableStrategies: StrategyKey[] = ['purchase', 'longTerm', 'airbnb', 'padSplit', 'brrrr', 'flip'];

const parseStrategy = (value: string | null): StrategyKey => {
  if (!value) return 'purchase';
  return printableStrategies.includes(value as StrategyKey) ? (value as StrategyKey) : 'purchase';
};

export default function ReportResolverPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug;
  const hasValidSlug = typeof slug === 'string' && slug.length > 0;
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!hasValidSlug) return;
    const resolvedSlug = slug;
    let cancelled = false;

    const resolveReportShare = async () => {
      const { share, error } = await fetchShareBySlug(resolvedSlug);
      if (cancelled) return;

      if (error || !share) {
        setStatus('error');
        setErrorMessage(error instanceof Error && error.message === 'Link expired' ? 'Link expired.' : 'Link not found or unavailable.');
        void trackAnalyticsEvent('share_link_open_failed', { source: 'report_short_link', reason: error instanceof Error ? error.message : 'unavailable' });
        return;
      }

      void trackAnalyticsEvent('share_link_opened', { source: 'report_short_link' });
      const strategy = parseStrategy(new URLSearchParams(window.location.search).get('strategy'));

      const reportScenario = createScenarioRecord(share.payload_snapshot, {
        scenarioId: `report-${share.slug}`,
        dealName: share.payload_snapshot.purchase.dealName
      });
      const reportParams = new URLSearchParams();
      reportParams.set('scenario', encodeScenario(reportScenario));
      reportParams.set('strategy', strategy);
      router.replace(`/print?${reportParams.toString()}`);
    };

    resolveReportShare();

    return () => {
      cancelled = true;
    };
  }, [hasValidSlug, router, slug]);

  if (!hasValidSlug) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="max-w-sm rounded-xl border border-white/10 bg-panel/70 p-5 text-center shadow-soft">
          <h1 className="text-base font-semibold">Unable to open report link</h1>
          <p className="mt-2 text-sm text-muted">Link not found.</p>
          <Link href="/" className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-medium hover:bg-white/15">
            Open DealCooker
          </Link>
        </div>
      </main>
    );
  }

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="max-w-sm rounded-xl border border-white/10 bg-panel/70 p-5 text-center shadow-soft">
          <p className="text-xs uppercase tracking-[0.16em] text-accent">Shared report</p>
          <h1 className="mt-1 text-base font-semibold">Opening report snapshot</h1>
          <p className="mt-2 text-sm text-muted">Loading the saved PDF report assumptions.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="max-w-sm rounded-xl border border-white/10 bg-panel/70 p-5 text-center shadow-soft">
        <h1 className="text-base font-semibold">Unable to open report link</h1>
        <p className="mt-2 text-sm text-muted">{errorMessage}</p>
        <p className="mt-2 text-xs text-muted">Ask the sender for a fresh link if this was recently shared.</p>
        <Link href="/" className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-medium hover:bg-white/15">
          Open DealCooker
        </Link>
      </div>
    </main>
  );
}
