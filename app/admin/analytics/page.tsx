'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { ADMIN_OWNER_EMAIL, isOwnerEmail } from '@/lib/admin-access';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';

type DashboardStats = {
  ownerEmail: string;
  generatedAt: string;
  analyticsReady: boolean;
  warnings: string[];
  metrics: {
    totalUserAccounts: number;
    newAccountCount7d: number;
    totalScenarios: number;
    totalShareLinks: number;
    activeToday: number;
    active7d: number;
    active30d: number;
    activeAccountsToday: number;
    activeAccounts7d: number;
    activeAccounts30d: number;
    activeVisitorsToday: number;
    activeVisitors7d: number;
    activeVisitors30d: number;
    anonymousVisitorsToday: number;
    anonymousVisitors7d: number;
    anonymousVisitors30d: number;
    signedInEvents30d: number;
    anonymousEvents30d: number;
    totalEvents30d: number;
    pwaPromptShown30d: number;
    pwaPromptAccepted30d: number;
    pwaInstalls30d: number;
    scenarioCreated30d: number;
    shareLinksCreated30d: number;
    shareLinksOpened30d: number;
    printOpens30d: number;
    dealReviewRequests30d: number;
    feedbackSent30d: number;
    clientErrors7d: number;
  };
  charts: {
    dailyEvents: Array<{ day: string; count: number }>;
    dailyActive: Array<{ day: string; count: number }>;
    dailyActiveAccounts: Array<{ day: string; count: number }>;
    dailyActiveVisitors: Array<{ day: string; count: number }>;
    topEvents: Array<{ label: string; count: number }>;
    topRoutes: Array<{ label: string; count: number }>;
    displayModeCounts: Array<{ label: string; count: number }>;
    severityCounts: Array<{ label: string; count: number }>;
    errorPatterns: Array<{ label: string; count: number }>;
  };
  recentEvents: Array<{ eventName: string; createdAt: string; route: string | null; release: string | null; signedIn: boolean }>;
  recentFeedback: Array<{
    created_at: string;
    status: string;
    resend_email_id: string | null;
    resend_status: number | null;
    resend_error: string | null;
    contact_name: string | null;
    contact_email: string;
    source: string | null;
    viewport: string | null;
    route: string | null;
    app_release: string | null;
    message: string;
  }>;
  recentErrors: Array<{
    created_at: string;
    severity: string;
    source: string;
    operation: string | null;
    message: string;
    stack: string | null;
    route: string | null;
    release: string | null;
    metadata: Record<string, unknown> | null;
  }>;
};

type LoadState = 'loading' | 'ready' | 'signed-out' | 'forbidden' | 'unconfigured' | 'error';

const numberFormatter = new Intl.NumberFormat('en-US');
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
});

const formatNumber = (value: number) => numberFormatter.format(value);

const formatMetadata = (metadata: Record<string, unknown> | null) => {
  if (!metadata || Object.keys(metadata).length === 0) return null;

  try {
    const serialized = JSON.stringify(metadata, null, 2);
    return serialized.length > 1200 ? `${serialized.slice(0, 1200)}...` : serialized;
  } catch {
    return 'Metadata unavailable.';
  }
};

const formatPercent = (value: number, max: number) => {
  if (max <= 0) return '0%';
  return `${Math.round(Math.min(100, Math.max(0, (value / max) * 100)))}%`;
};

function GaugeCard({
  label,
  value,
  max,
  detail,
  tone = 'accent'
}: {
  label: string;
  value: number;
  max: number;
  detail: string;
  tone?: 'accent' | 'orange' | 'red';
}) {
  const percent = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  const color = tone === 'red' ? '#ef4444' : tone === 'orange' ? '#fb8b23' : '#22d3ee';

  return (
    <section className="section-shell section-shell-utility rounded-2xl p-4">
      <div className="flex items-center gap-4">
        <div
          className="grid h-20 w-20 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(${color} ${percent * 3.6}deg, rgba(255,255,255,0.1) 0deg)` }}
          aria-label={`${label}: ${formatPercent(value, max)}`}
        >
          <div className="grid h-14 w-14 place-items-center rounded-full bg-slate-950/90 text-xs font-semibold text-slate-100">
            {formatPercent(value, max)}
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-100">{formatNumber(value)}</p>
          <p className="mt-1 text-xs text-muted">{detail}</p>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <section className="section-inner rounded-2xl px-4 py-3">
      <p className="text-xs uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-100">{formatNumber(value)}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </section>
  );
}

function ExplainerCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section-shell section-shell-utility rounded-2xl p-4">
      <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function BarList({ title, items }: { title: string; items: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...items.map((item) => item.count));

  return (
    <section className="section-shell section-shell-utility rounded-2xl p-4">
      <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      <div className="mt-3 space-y-3">
        {items.length === 0 ? <p className="text-sm text-muted">No events yet.</p> : null}
        {items.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-slate-200">{item.label}</span>
              <span className="font-semibold text-slate-100">{formatNumber(item.count)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MiniTrend({ title, items }: { title: string; items: Array<{ day: string; count: number }> }) {
  const max = Math.max(1, ...items.map((item) => item.count));

  return (
    <section className="section-shell section-shell-utility rounded-2xl p-4">
      <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      <div className="mt-4 flex h-28 items-end gap-1.5">
        {items.map((item) => (
          <div key={item.day} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
            <div
              className="min-h-1 rounded-t bg-orange-300"
              style={{ height: `${Math.max(4, (item.count / max) * 100)}%` }}
              title={`${item.day}: ${item.count}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted">
        <span>{items[0]?.day.slice(5) ?? ''}</span>
        <span>{items.at(-1)?.day.slice(5) ?? ''}</span>
      </div>
    </section>
  );
}

function RecentFeedbackCard({ feedback }: { feedback: DashboardStats['recentFeedback'][number] }) {
  const statusTone = feedback.status === 'email_accepted' ? 'border-cyan-300/30 bg-cyan-500/10 text-cyan-100' : 'border-orange-300/35 bg-orange-500/10 text-orange-100';

  return (
    <div className="section-inner rounded-xl px-3 py-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusTone}`}>
              {feedback.status.replaceAll('_', ' ')}
            </span>
            <span className="font-semibold text-slate-100">{feedback.contact_name || feedback.contact_email}</span>
            {feedback.contact_name ? <span className="text-muted">{feedback.contact_email}</span> : null}
          </div>
          <p className="mt-2 break-words text-slate-200">{feedback.message}</p>
        </div>
        <span className="shrink-0 text-muted">{dateFormatter.format(new Date(feedback.created_at))}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
        <span>{feedback.source ?? 'unknown'} / {feedback.viewport ?? 'unknown'}</span>
        <span>{feedback.route ?? 'No route'}</span>
        {feedback.resend_email_id ? <span>Resend {feedback.resend_email_id}</span> : null}
        {feedback.resend_status ? <span>HTTP {feedback.resend_status}</span> : null}
      </div>

      {feedback.resend_error ? (
        <details className="mt-2 rounded-lg border border-white/10 bg-black/15 px-2 py-1.5">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-200">Delivery response</summary>
          <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-300">{feedback.resend_error}</pre>
        </details>
      ) : null}
    </div>
  );
}

function RecentErrorCard({ error, index }: { error: DashboardStats['recentErrors'][number]; index: number }) {
  const metadata = formatMetadata(error.metadata);

  return (
    <div className="section-inner rounded-xl px-3 py-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-red-300/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-100">
              {error.severity}
            </span>
            <span className="font-semibold text-slate-100">{error.source}</span>
            {error.operation ? <span className="text-muted">{error.operation}</span> : null}
          </div>
          <p className="mt-2 break-words text-slate-200">{error.message}</p>
        </div>
        <span className="shrink-0 text-muted">{dateFormatter.format(new Date(error.created_at))}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
        <span>{error.route ?? 'No route'}</span>
        {error.release ? <span>Release {error.release.slice(0, 12)}</span> : null}
      </div>

      {error.stack || metadata ? (
        <details className="mt-2 rounded-lg border border-white/10 bg-black/15 px-2 py-1.5">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-200">Debug details {index + 1}</summary>
          {error.stack ? <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-300">{error.stack}</pre> : null}
          {metadata ? (
            <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-300">{metadata}</pre>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [state, setState] = useState<LoadState>('loading');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setState('loading');
    setMessage(null);

    if (!isSupabaseConfigured) {
      setState('unconfigured');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setState('unconfigured');
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    const user = session?.user ?? null;
    const accessToken = session?.access_token;

    if (!user || !accessToken) {
      setState('signed-out');
      return;
    }

    if (!isOwnerEmail(user.email)) {
      setState('forbidden');
      return;
    }

    try {
      const response = await fetch('/api/admin/analytics', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });

      if (!response.ok) {
        setState(response.status === 403 ? 'forbidden' : 'error');
        setMessage(`Admin stats failed with HTTP ${response.status}.`);
        return;
      }

      const payload = (await response.json()) as DashboardStats;
      setStats(payload);
      setState('ready');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Admin stats are unavailable.');
    }
  }, []);

  useEffect(() => {
    void loadStats();

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const { data } = supabase.auth.onAuthStateChange(() => {
      void loadStats();
    });

    return () => data.subscription.unsubscribe();
  }, [loadStats]);

  const content = (() => {
    if (state === 'loading') {
      return <p className="section-shell section-shell-utility rounded-2xl p-4 text-sm text-muted">Checking access...</p>;
    }

    if (state === 'unconfigured') {
      return <p className="section-shell section-shell-utility rounded-2xl p-4 text-sm text-muted">Supabase is not configured in this environment.</p>;
    }

    if (state === 'signed-out') {
      return (
        <section className="section-shell section-shell-utility rounded-2xl p-4">
          <h2 className="text-base font-semibold text-slate-100">Owner sign-in required</h2>
          <p className="mt-2 text-sm text-muted">Sign in on the main app with {ADMIN_OWNER_EMAIL}, then reopen Admin.</p>
        </section>
      );
    }

    if (state === 'forbidden') {
      return (
        <section className="section-shell section-shell-utility rounded-2xl p-4">
          <h2 className="text-base font-semibold text-slate-100">Not available for this account</h2>
          <p className="mt-2 text-sm text-muted">This dashboard is restricted to the DealCooker owner account.</p>
        </section>
      );
    }

    if (state === 'error' || !stats) {
      return (
        <section className="section-shell section-shell-utility rounded-2xl p-4">
          <h2 className="text-base font-semibold text-slate-100">Dashboard unavailable</h2>
          <p className="mt-2 text-sm text-muted">{message ?? 'Try refreshing after deployment finishes.'}</p>
        </section>
      );
    }

    const metrics = stats.metrics;
    const promptMax = Math.max(1, metrics.pwaPromptShown30d);

    return (
      <div className="space-y-5">
        {stats.warnings.length > 0 ? (
          <section className="rounded-2xl border border-orange-300/35 bg-orange-500/10 p-4 text-sm text-orange-100">
            <p className="font-semibold">Setup attention</p>
            <ul className="mt-2 space-y-1 text-xs">
              {stats.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-3">
          <GaugeCard
            label="Active accounts"
            value={metrics.activeAccounts30d}
            max={Math.max(1, metrics.totalUserAccounts)}
            detail="Signed-in user accounts active in 30 days"
          />
          <GaugeCard
            label="PWA installs"
            value={metrics.pwaInstalls30d}
            max={promptMax}
            detail={`${formatNumber(metrics.pwaPromptAccepted30d)} accepted from ${formatNumber(metrics.pwaPromptShown30d)} prompts`}
            tone="orange"
          />
          <GaugeCard
            label="Errors"
            value={metrics.clientErrors7d}
            max={Math.max(1, metrics.totalEvents30d)}
            detail="Client errors captured in the last 7 days"
            tone="red"
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
          <ExplainerCard title="Account Activity vs Visitor Activity">
            <p>
              <span className="font-semibold text-slate-100">Active accounts</span> only counts signed-in Supabase user accounts.
              This is the number to compare against total user accounts.
            </p>
            <p>
              <span className="font-semibold text-slate-100">Visitor identities</span> counts signed-in accounts plus anonymous browser/device IDs before sign-in.
              It can be higher than user accounts when people browse without signing in, use multiple devices, clear storage, or install/open the PWA separately.
            </p>
          </ExplainerCard>
          <section className="section-shell section-shell-utility rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-slate-100">30-day Audience Split</h2>
            <div className="mt-3 grid gap-2">
              <MetricCard label="Active accounts" value={metrics.activeAccounts30d} detail="Signed-in accounts with tracked activity" />
              <MetricCard label="Anonymous visitors" value={metrics.anonymousVisitors30d} detail="Browser/device identities without a signed-in account" />
              <MetricCard label="Visitor identities" value={metrics.activeVisitors30d} detail="Accounts plus anonymous browser/device identities" />
            </div>
          </section>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="User accounts" value={metrics.totalUserAccounts} detail={`${formatNumber(metrics.newAccountCount7d)} new in 7 days`} />
          <MetricCard label="Saved deals" value={metrics.totalScenarios} detail={`${formatNumber(metrics.scenarioCreated30d)} created in 30 days`} />
          <MetricCard label="Share links" value={metrics.totalShareLinks} detail={`${formatNumber(metrics.shareLinksOpened30d)} opens in 30 days`} />
          <MetricCard label="Print opens" value={metrics.printOpens30d} detail="PDF/print workflow opens in 30 days" />
          <MetricCard label="Deal reviews" value={metrics.dealReviewRequests30d} detail="Review requests in 30 days" />
          <MetricCard label="Feedback" value={metrics.feedbackSent30d} detail="Feedback submissions in 30 days" />
          <MetricCard label="Events" value={metrics.totalEvents30d} detail={`${formatNumber(metrics.signedInEvents30d)} signed-in / ${formatNumber(metrics.anonymousEvents30d)} anonymous sampled events`} />
          <MetricCard label="Today" value={metrics.activeVisitorsToday} detail={`${formatNumber(metrics.activeAccountsToday)} accounts, ${formatNumber(metrics.anonymousVisitorsToday)} anonymous identities`} />
          <MetricCard label="Shares created" value={metrics.shareLinksCreated30d} detail="Share actions in 30 days" />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <MiniTrend title="Daily Active Accounts" items={stats.charts.dailyActiveAccounts} />
          <MiniTrend title="Daily Visitor Identities" items={stats.charts.dailyActiveVisitors} />
          <MiniTrend title="Daily Events" items={stats.charts.dailyEvents} />
          <BarList title="Top Events" items={stats.charts.topEvents} />
          <BarList title="Top Routes" items={stats.charts.topRoutes} />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <section className="section-shell section-shell-utility rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-slate-100">Recent Feedback</h2>
            <p className="mt-1 text-xs text-muted">Stored feedback with Resend delivery ids when the email API accepts a message.</p>
            <div className="mt-3 space-y-2">
              {stats.recentFeedback.length === 0 ? <p className="text-sm text-muted">No stored feedback in the last 30 days.</p> : null}
              {stats.recentFeedback.map((feedback, index) => (
                <RecentFeedbackCard key={`${feedback.created_at}-${feedback.contact_email}-${index}`} feedback={feedback} />
              ))}
            </div>
          </section>

          <section className="section-shell section-shell-utility rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-slate-100">Recent Events</h2>
            <div className="mt-3 space-y-2">
              {stats.recentEvents.length === 0 ? <p className="text-sm text-muted">No tracked events yet.</p> : null}
              {stats.recentEvents.map((event, index) => (
                <div key={`${event.createdAt}-${event.eventName}-${index}`} className="section-inner rounded-xl px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-100">{event.eventName}</span>
                    <span className="text-muted">{dateFormatter.format(new Date(event.createdAt))}</span>
                  </div>
                  <p className="mt-1 truncate text-muted">{event.route ?? 'No route'} · {event.signedIn ? 'signed in' : 'anonymous'}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="section-shell section-shell-utility rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-slate-100">Recent Errors</h2>
            <p className="mt-1 text-xs text-muted">Latest captured production errors, with sanitized route, release, stack, and metadata when available.</p>
            <div className="mt-3 space-y-2">
              {stats.recentErrors.length === 0 ? <p className="text-sm text-muted">No client errors in the last 7 days.</p> : null}
              {stats.recentErrors.map((error, index) => <RecentErrorCard key={`${error.created_at}-${error.source}-${index}`} error={error} index={index} />)}
            </div>
          </section>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <BarList title="Error Patterns" items={stats.charts.errorPatterns} />
          <BarList title="Error Severity" items={stats.charts.severityCounts} />
        </div>
      </div>
    );
  })();

  if (state !== 'ready' || !stats) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-6 text-slate-100">
        <div className="w-full max-w-lg space-y-3">
          {content}
          <Link href="/" className="inline-flex min-h-10 items-center rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-medium hover:bg-white/15">
            Back to app
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface px-3 py-4 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-accent">Owner dashboard</p>
            <h1 className="mt-1 text-2xl font-semibold">DealCooker Admin</h1>
            <p className="mt-1 text-sm text-muted">
              Account, install, usage, share, print, feedback, and production error stats.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {stats?.generatedAt ? <span className="text-xs text-muted">Updated {dateFormatter.format(new Date(stats.generatedAt))}</span> : null}
            <button
              type="button"
              onClick={() => void loadStats()}
              className="tap-feedback section-action section-action-utility rounded-xl px-3 py-2 text-sm font-medium text-slate-100"
            >
              Refresh
            </button>
            <Link href="/" className="btn-primary btn-auth tap-feedback rounded-xl px-3 py-2 text-sm font-semibold">
              Back to app
            </Link>
          </div>
        </header>

        {content}
      </div>
    </main>
  );
}
