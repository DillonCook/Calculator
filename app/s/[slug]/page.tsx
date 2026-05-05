'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { trackAnalyticsEvent } from '@/lib/analytics';
import { createDealInVault, saveDealToVault } from '@/lib/deals-vault-service';
import { fetchShareBySlug } from '@/lib/share-links';

const SHARE_IMPORT_NOTICE_STORAGE_KEY = 'dealcooker-share-imported:v1';

export default function ShareResolverPage() {
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

    const resolveShare = async () => {
      const { share, error } = await fetchShareBySlug(resolvedSlug);
      if (cancelled) return;

      if (error || !share) {
        setStatus('error');
        setErrorMessage(error instanceof Error && error.message === 'Link expired' ? 'Link expired.' : 'Link not found or unavailable.');
        void trackAnalyticsEvent('share_link_open_failed', { reason: error instanceof Error ? error.message : 'unavailable' });
        return;
      }

      void trackAnalyticsEvent('share_link_opened', { source: 'short_link' });
      const imported = createDealInVault(share.payload_snapshot, share.payload_snapshot.purchase.dealName);
      saveDealToVault(imported);
      window.sessionStorage.setItem(SHARE_IMPORT_NOTICE_STORAGE_KEY, imported.dealName);
      router.replace('/');
    };

    resolveShare();

    return () => {
      cancelled = true;
    };
  }, [hasValidSlug, router, slug]);

  if (!hasValidSlug) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="max-w-sm rounded-xl border border-white/10 bg-panel/70 p-5 text-center shadow-soft">
          <h1 className="text-base font-semibold">Unable to open share link</h1>
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
          <p className="text-xs uppercase tracking-[0.16em] text-accent">Shared deal</p>
          <h1 className="mt-1 text-base font-semibold">Opening deal snapshot</h1>
          <p className="mt-2 text-sm text-muted">Importing a copy into your Deal Vault so the original shared link stays unchanged.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="max-w-sm rounded-xl border border-white/10 bg-panel/70 p-5 text-center shadow-soft">
        <h1 className="text-base font-semibold">Unable to open share link</h1>
        <p className="mt-2 text-sm text-muted">{errorMessage}</p>
        <p className="mt-2 text-xs text-muted">Ask the sender for a fresh link if this was recently shared.</p>
        <Link href="/" className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-medium hover:bg-white/15">
          Open DealCooker
        </Link>
      </div>
    </main>
  );
}
