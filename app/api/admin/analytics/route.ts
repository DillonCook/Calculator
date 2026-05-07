import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';

import { ADMIN_OWNER_EMAIL, normalizeEmail } from '@/lib/admin-access';
import { getSupabaseAdminClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

type AnalyticsEventRow = {
  event_name: string;
  created_at: string;
  user_id: string | null;
  anonymous_id: string | null;
  session_id: string | null;
  route: string | null;
  release: string | null;
  properties: Record<string, unknown> | null;
};

type ClientErrorRow = {
  created_at: string;
  severity: string;
  source: string;
  operation: string | null;
  message: string;
  stack: string | null;
  route: string | null;
  release: string | null;
  metadata: Record<string, unknown> | null;
};

type FeedbackSubmissionRow = {
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
};

const getBearerToken = (request: Request) => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
};

const startOfUtcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const daysAgo = (days: number) => {
  const date = startOfUtcDay(new Date());
  date.setUTCDate(date.getUTCDate() - days);
  return date;
};

const buildDayKeys = (days: number) => {
  const start = daysAgo(days - 1);
  return Array.from({ length: days }, (_, index) => {
    const next = new Date(start);
    next.setUTCDate(start.getUTCDate() + index);
    return next.toISOString().slice(0, 10);
  });
};

const countBy = <T,>(items: T[], getKey: (item: T) => string | null | undefined) => {
  const counts = new Map<string, number>();

  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

const visitorIdentityKey = (event: AnalyticsEventRow) => {
  if (event.user_id) return `account:${event.user_id}`;
  if (event.anonymous_id) return `anon:${event.anonymous_id}`;
  if (event.session_id) return `session:${event.session_id}`;
  return null;
};

const accountIdentityKey = (event: AnalyticsEventRow) => event.user_id ? `account:${event.user_id}` : null;

const anonymousIdentityKey = (event: AnalyticsEventRow) => {
  if (event.user_id) return null;
  if (event.anonymous_id) return `anon:${event.anonymous_id}`;
  if (event.session_id) return `session:${event.session_id}`;
  return null;
};

const countDistinctSince = (events: AnalyticsEventRow[], since: Date, getKey: (event: AnalyticsEventRow) => string | null) => {
  const unique = new Set<string>();
  const sinceMs = since.getTime();

  for (const event of events) {
    if (new Date(event.created_at).getTime() < sinceMs) continue;
    const key = getKey(event);
    if (key) unique.add(key);
  }

  return unique.size;
};

const buildDailyDistinct = (
  events: AnalyticsEventRow[],
  dayKeys: string[],
  getKey: (event: AnalyticsEventRow) => string | null
) =>
  dayKeys.map((day) => {
    const unique = new Set<string>();
    for (const event of events) {
      if (event.created_at.slice(0, 10) !== day) continue;
      const key = getKey(event);
      if (key) unique.add(key);
    }
    return { day, count: unique.size };
  });

const eventCount = (events: AnalyticsEventRow[], eventName: string) => events.filter((event) => event.event_name === eventName).length;

const countTableRows = async (supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>, tableName: string) => {
  const { count, error } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
  return { count: count ?? 0, error: error?.message ?? null };
};

const countTableRowsSince = async (
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  tableName: string,
  since: Date
) => {
  const { count, error } = await supabase.from(tableName).select('*', { count: 'exact', head: true }).gte('created_at', since.toISOString());
  return { count: count ?? 0, error: error?.message ?? null };
};

const countAnalyticsEvent = async (
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  eventName: string,
  since: Date
) => {
  const { count, error } = await supabase
    .from('analytics_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_name', eventName)
    .gte('created_at', since.toISOString());

  return { eventName, count: count ?? 0, error: error?.message ?? null };
};

const listAllUsers = async (supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>) => {
  const users: User[] = [];
  const perPage = 1000;

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) return { users, error: error.message };

    users.push(...data.users);
    if (data.users.length < perPage) break;
  }

  return { users, error: null };
};

export async function GET(request: Request) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase admin is not configured.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  if (normalizeEmail(data.user.email) !== ADMIN_OWNER_EMAIL) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  const now = new Date();
  const today = startOfUtcDay(now);
  const since7 = daysAgo(6);
  const since30 = daysAgo(29);
  const dayKeys = buildDayKeys(14);

  const eventNamesToCount = [
    'pwa_install_prompt_shown',
    'pwa_install_prompt_accepted',
    'pwa_installed',
    'scenario_created',
    'share_link_created',
    'share_link_opened',
    'print_opened',
    'deal_review_requested',
    'feedback_sent'
  ];

  const [
    usersResult,
    scenariosResult,
    sharesResult,
    dealReviewRequestsResult,
    feedbackSubmissionsCountResult,
    analyticsCountResult,
    analyticsResult,
    eventCountResults,
    errorsCountResult,
    errorsResult,
    feedbackSubmissionsResult
  ] = await Promise.all([
    listAllUsers(supabase),
    countTableRows(supabase, 'scenarios'),
    countTableRows(supabase, 'shares'),
    countTableRowsSince(supabase, 'deal_review_requests', since30),
    countTableRowsSince(supabase, 'feedback_submissions', since30),
    countTableRowsSince(supabase, 'analytics_events', since30),
    supabase
      .from('analytics_events')
      .select('event_name, created_at, user_id, anonymous_id, session_id, route, release, properties')
      .gte('created_at', since30.toISOString())
      .order('created_at', { ascending: false })
      .limit(10000),
    Promise.all(eventNamesToCount.map((eventName) => countAnalyticsEvent(supabase, eventName, since30))),
    countTableRowsSince(supabase, 'client_error_events', since7),
    supabase
      .from('client_error_events')
      .select('created_at, severity, source, operation, message, stack, route, release, metadata')
      .gte('created_at', since7.toISOString())
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase
      .from('feedback_submissions')
      .select('created_at, status, resend_email_id, resend_status, resend_error, contact_name, contact_email, source, viewport, route, app_release, message')
      .gte('created_at', since30.toISOString())
      .order('created_at', { ascending: false })
      .limit(25)
  ]);

  const analyticsEvents = analyticsResult.error ? [] : ((analyticsResult.data ?? []) as AnalyticsEventRow[]);
  const errors = errorsResult.error ? [] : ((errorsResult.data ?? []) as ClientErrorRow[]);
  const recentErrors = errors.slice(0, 25);
  const recentFeedback = feedbackSubmissionsResult.error ? [] : ((feedbackSubmissionsResult.data ?? []) as FeedbackSubmissionRow[]);
  const eventCounts = new Map(
    eventCountResults.filter((result) => !result.error).map((result) => [result.eventName, result.count])
  );
  const users = usersResult.users;
  const newAccountCount7d = users.filter((user) => user.created_at && new Date(user.created_at).getTime() >= since7.getTime()).length;

  const dailyEvents = dayKeys.map((day) => ({
    day,
    count: analyticsEvents.filter((event) => event.created_at.slice(0, 10) === day).length
  }));

  const dailyActiveVisitors = buildDailyDistinct(analyticsEvents, dayKeys, visitorIdentityKey);
  const dailyActiveAccounts = buildDailyDistinct(analyticsEvents, dayKeys, accountIdentityKey);

  const topEvents = countBy(analyticsEvents, (event) => event.event_name).slice(0, 10);
  const topRoutes = countBy(analyticsEvents, (event) => event.route).slice(0, 10);
  const displayModeCounts = countBy(analyticsEvents, (event) => {
    const displayMode = event.properties?.displayMode;
    return typeof displayMode === 'string' ? displayMode : null;
  });
  const severityCounts = countBy(errors, (error) => error.severity);
  const errorPatterns = countBy(errors, (error) => `${error.source}: ${error.message}${error.route ? ` (${error.route})` : ''}`).slice(0, 10);
  const eventCountWarnings = eventCountResults
    .filter((result) => result.error)
    .map((result) => `Unable to count ${result.eventName}: ${result.error}`);

  return NextResponse.json(
    {
      ownerEmail: data.user.email,
      generatedAt: now.toISOString(),
      analyticsReady: !analyticsResult.error,
      warnings: [
        usersResult.error ? `Unable to list auth users: ${usersResult.error}` : null,
        scenariosResult.error ? `Unable to count scenarios: ${scenariosResult.error}` : null,
        sharesResult.error ? `Unable to count shares: ${sharesResult.error}` : null,
        dealReviewRequestsResult.error ? `Unable to count deal review requests: ${dealReviewRequestsResult.error}` : null,
        feedbackSubmissionsCountResult.error ? `Unable to count stored feedback submissions: ${feedbackSubmissionsCountResult.error}` : null,
        analyticsCountResult.error ? `Unable to count analytics events: ${analyticsCountResult.error}` : null,
        analyticsResult.error ? `Analytics table is not ready: ${analyticsResult.error.message}` : null,
        analyticsEvents.length >= 10000 ? 'Recent analytics sample hit 10,000 rows. Headline counts are exact, but charts and recent-event lists may be sampled.' : null,
        ...eventCountWarnings,
        errorsCountResult.error ? `Unable to count client errors: ${errorsCountResult.error}` : null,
        errorsResult.error ? `Unable to load client errors: ${errorsResult.error.message}` : null,
        errors.length >= 1000 ? 'Recent client-error sample hit 1,000 rows. Error patterns may be sampled.' : null,
        feedbackSubmissionsResult.error ? `Unable to load stored feedback submissions: ${feedbackSubmissionsResult.error.message}` : null
      ].filter(Boolean),
      metrics: {
        totalUserAccounts: users.length,
        newAccountCount7d,
        totalScenarios: scenariosResult.count,
        totalShareLinks: sharesResult.count,
        activeToday: countDistinctSince(analyticsEvents, today, visitorIdentityKey),
        active7d: countDistinctSince(analyticsEvents, since7, visitorIdentityKey),
        active30d: countDistinctSince(analyticsEvents, since30, visitorIdentityKey),
        activeAccountsToday: countDistinctSince(analyticsEvents, today, accountIdentityKey),
        activeAccounts7d: countDistinctSince(analyticsEvents, since7, accountIdentityKey),
        activeAccounts30d: countDistinctSince(analyticsEvents, since30, accountIdentityKey),
        activeVisitorsToday: countDistinctSince(analyticsEvents, today, visitorIdentityKey),
        activeVisitors7d: countDistinctSince(analyticsEvents, since7, visitorIdentityKey),
        activeVisitors30d: countDistinctSince(analyticsEvents, since30, visitorIdentityKey),
        anonymousVisitorsToday: countDistinctSince(analyticsEvents, today, anonymousIdentityKey),
        anonymousVisitors7d: countDistinctSince(analyticsEvents, since7, anonymousIdentityKey),
        anonymousVisitors30d: countDistinctSince(analyticsEvents, since30, anonymousIdentityKey),
        signedInEvents30d: analyticsEvents.filter((event) => event.user_id).length,
        anonymousEvents30d: analyticsEvents.filter((event) => !event.user_id).length,
        totalEvents30d: analyticsCountResult.error ? analyticsEvents.length : analyticsCountResult.count,
        pwaPromptShown30d: eventCounts.get('pwa_install_prompt_shown') ?? eventCount(analyticsEvents, 'pwa_install_prompt_shown'),
        pwaPromptAccepted30d: eventCounts.get('pwa_install_prompt_accepted') ?? eventCount(analyticsEvents, 'pwa_install_prompt_accepted'),
        pwaInstalls30d: eventCounts.get('pwa_installed') ?? eventCount(analyticsEvents, 'pwa_installed'),
        scenarioCreated30d: eventCounts.get('scenario_created') ?? eventCount(analyticsEvents, 'scenario_created'),
        shareLinksCreated30d: eventCounts.get('share_link_created') ?? eventCount(analyticsEvents, 'share_link_created'),
        shareLinksOpened30d: eventCounts.get('share_link_opened') ?? eventCount(analyticsEvents, 'share_link_opened'),
        printOpens30d: eventCounts.get('print_opened') ?? eventCount(analyticsEvents, 'print_opened'),
        dealReviewRequests30d: dealReviewRequestsResult.error
          ? eventCounts.get('deal_review_requested') ?? eventCount(analyticsEvents, 'deal_review_requested')
          : dealReviewRequestsResult.count,
        feedbackSent30d: feedbackSubmissionsCountResult.error
          ? eventCounts.get('feedback_sent') ?? eventCount(analyticsEvents, 'feedback_sent')
          : feedbackSubmissionsCountResult.count,
        clientErrors7d: errorsCountResult.error ? errors.length : errorsCountResult.count
      },
      charts: {
        dailyEvents,
        dailyActive: dailyActiveVisitors,
        dailyActiveAccounts,
        dailyActiveVisitors,
        topEvents,
        topRoutes,
        displayModeCounts,
        severityCounts,
        errorPatterns
      },
      recentEvents: analyticsEvents.slice(0, 15).map((event) => ({
        eventName: event.event_name,
        createdAt: event.created_at,
        route: event.route,
        release: event.release,
        signedIn: Boolean(event.user_id)
      })),
      recentFeedback,
      recentErrors
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
