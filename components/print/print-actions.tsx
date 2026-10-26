'use client';

import { useEffect, useMemo, useState } from 'react';

import { trackAnalyticsEvent } from '@/lib/analytics';
import { decodeScenario } from '@/lib/scenario-storage';
import { encodeDealToShareParam } from '@/lib/share-link';
import { createShortShareLink } from '@/lib/share-links';
import { getSupabaseClient } from '@/lib/supabaseClient';
import type { StrategyKey } from '@/lib/models/deal';

interface PrintActionsProps {
  documentTitle?: string;
  scenarioToken?: string;
  strategy?: StrategyKey;
}

export function PrintActions({ documentTitle, scenarioToken, strategy }: PrintActionsProps) {
  const [copyFeedback, setCopyFeedback] = useState<{ tone: 'success' | 'error'; message: string; fallbackUrl?: string } | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [browserLocation, setBrowserLocation] = useState<{ origin: string; href: string } | null>(null);
  useEffect(() => {
    setBrowserLocation({ origin: window.location.origin, href: window.location.href });
  }, []);

  const decodedScenario = useMemo(() => (scenarioToken ? decodeScenario(scenarioToken) : null), [scenarioToken]);
  const editableDealUrl = useMemo(() => {
    if (!browserLocation || !decodedScenario) return null;

    const editableToken = encodeDealToShareParam(decodedScenario.payload);
    return editableToken ? `${browserLocation.origin}/?s=${editableToken}` : null;
  }, [decodedScenario, browserLocation]);
  const reportUrl = browserLocation?.href ?? null;

  useEffect(() => {
    if (!documentTitle) return;

    const previousTitle = document.title;
    document.title = documentTitle;

    return () => {
      document.title = previousTitle;
    };
  }, [documentTitle]);

  const copyShareableReportLink = async () => {
    if (!reportUrl) return;

    setIsCopying(true);
    setCopyFeedback(null);
    let urlToCopy = reportUrl;
    let copiedShortUrl = false;
    let canAttemptShortLink = false;

    if (decodedScenario) {
      try {
        const supabase = getSupabaseClient();
        const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
        const ownerId = data.session?.user?.id;
        canAttemptShortLink = Boolean(ownerId);

        if (ownerId) {
          const { slug, error } = await createShortShareLink({
            ownerId,
            scenarioId: decodedScenario.scenarioId,
            payloadSnapshot: decodedScenario.payload
          });

          if (!error && slug) {
            const shortParams = new URLSearchParams();
            if (strategy) {
              shortParams.set('strategy', strategy);
            }
            urlToCopy = `${window.location.origin}/r/${slug}${shortParams.size > 0 ? `?${shortParams.toString()}` : ''}`;
            copiedShortUrl = true;
          } else {
            console.error('Supabase report share create error:', error);
          }
        }
      } catch (error) {
        console.error('Report share link error:', error);
      }
    }

    try {
      await navigator.clipboard.writeText(urlToCopy);
      void trackAnalyticsEvent('share_link_created', {
        source: copiedShortUrl ? 'report_short_link' : 'report_url_param',
        signedIn: canAttemptShortLink,
        strategy
      });
      setCopyFeedback({
        tone: 'success',
        message: copiedShortUrl ? 'Short report link copied.' : canAttemptShortLink ? 'Full report link copied.' : 'Full report link copied. Sign in for short links.'
      });
    } catch {
      setCopyFeedback({ tone: 'error', message: 'Could not copy link. Select and copy the link below.', fallbackUrl: urlToCopy });
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <div className="mx-auto mb-4 flex w-full max-w-4xl flex-wrap items-center justify-end gap-2 sm:mb-5 print:hidden">
      {editableDealUrl ? (
        <a
          className="print-action-secondary rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          href={editableDealUrl}
        >
          Open Editable Deal
        </a>
      ) : null}
      <button
        className="print-action-secondary rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        disabled={isCopying}
        onClick={copyShareableReportLink}
        type="button"
      >
        {isCopying ? 'Copying...' : 'Copy Shareable Link'}
      </button>
      <button
        className="print-action-primary rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        onClick={() => window.print()}
        type="button"
      >
        Print / Save PDF
      </button>
      {copyFeedback ? (
        <div role="status" className={`min-w-0 text-xs ${copyFeedback.fallbackUrl ? 'basis-full rounded-xl border border-rose-200 bg-white p-3 text-rose-700' : 'text-emerald-600'}`}>
          <p>{copyFeedback.message}</p>
          {copyFeedback.fallbackUrl ? (
            <>
              <textarea
                aria-label="Report share link"
                className="mt-2 block w-full min-w-0 resize-none rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"
                readOnly
                rows={3}
                value={copyFeedback.fallbackUrl}
                onFocus={(event) => event.currentTarget.select()}
                onClick={(event) => event.currentTarget.select()}
              />
              <button
                aria-label="Dismiss report share message"
                className="print-action-secondary mt-2 rounded-lg px-3 py-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600"
                onClick={() => setCopyFeedback(null)}
                type="button"
              >
                Dismiss
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
