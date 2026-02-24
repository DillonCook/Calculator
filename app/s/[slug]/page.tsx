'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createDealInVault, saveDealToVault } from '@/lib/deals-vault-service';
import { fetchShareBySlug } from '@/lib/share-links';

export default function ShareResolverPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const slug = params?.slug;
    if (!slug || typeof slug !== 'string') {
      setStatus('error');
      setErrorMessage('Link not found.');
      return;
    }

    let cancelled = false;

    const resolveShare = async () => {
      const { share, error } = await fetchShareBySlug(slug);
      if (cancelled) return;

      if (error || !share) {
        setStatus('error');
        setErrorMessage(error instanceof Error && error.message === 'Link expired' ? 'Link expired.' : 'Link not found or unavailable.');
        return;
      }

      const imported = createDealInVault(share.payload_snapshot, share.payload_snapshot.purchase.dealName);
      saveDealToVault(imported);
      router.replace('/');
    };

    resolveShare();

    return () => {
      cancelled = true;
    };
  }, [params?.slug, router]);

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-muted">Loading shared deal…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="rounded-xl border border-white/10 bg-panel/60 p-5 text-center">
        <h1 className="text-base font-semibold">Unable to open share link</h1>
        <p className="mt-2 text-sm text-muted">{errorMessage}</p>
      </div>
    </main>
  );
}
