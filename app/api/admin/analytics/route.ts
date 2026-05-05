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
  message: string;
  route: string | null;
  release: string | null;
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

const identityKey = (event: AnalyticsEventRow) => {
  if (event.user_id) return `user:${event.user_id}`;
  if (event.anonymous_id) return `anon:${event.anonymous_id}`;
  if (event.session_id) return `session:${event.session_id}`;
  return null;
};

const countDistinctUsersSince = (events: AnalyticsEventRow[], since: Date) => {
  const unique = new Set<string>();
  const sinceMs = since.getTime();

  for (const event of events) {
    if (new Date(event.created_at).getTime() < sinceMs) continue;
    const key = identityKey(event);
    if (key) unique.add(key);
  }

  return unique.size;
};

const eventCount = (events: AnalyticsEventRow[], eventName: string) => events.filter((event) => event.event_name === eventName).length;

const countTableRows = async (supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>, tableName: string) => {
  const { count, error } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
  return { count: count ?? 0, error: error?.message ?? null };
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

  const [usersResult, scenariosResult, sharesResult, analyticsResult, errorsResult] = await Promise.all([
    listAllUsers(supabase),
    countTableRows(supabase, 'scenarios'),
    countTableRows(supabase, 'shares'),
    supabase
      .from('analytics_events')
      .select('event_name, created_at, user_id, anonymous_id, session_id, route, release, properties')
      .gte('created_at', since30.toISOString())
      .order('created_at', { ascending: false })
      .limit(10000),
    supabase
      .from('client_error_events')
      .select('created_at, severity, source, message, route, release', { count: 'exact' })
      .gte('created_at', since7.toISOString())
      .order('created_at', { ascending: false })
      .limit(12)
  ]);

  const analyticsEvents = analyticsResult.error ? [] : ((analyticsResult.data ?? []) as AnalyticsEventRow[]);
  const recentErrors = errorsResult.error ? [] : ((errorsResult.data ?? []) as ClientErrorRow[]);
  const users = usersResult.users;
  const newAccountCount7d = users.filter((user) => user.created_at && new Date(user.created_at).getTime() >= since7.getTime()).length;

  const dailyEvents = dayKeys.map((day) => ({
    day,
    count: analyticsEvents.filter((event) => event.created_at.slice(0, 10) === day).length
  }));

  const dailyActive = dayKeys.map((day) => {
    const unique = new Set<string>();
    for (const event of analyticsEvents) {
      if (event.created_at.slice(0, 10) !== day) continue;
      const key = identityKey(event);
      if (key) unique.add(key);
    }
    return { day, count: unique.size };
  });

  const topEvents = countBy(analyticsEvents, (event) => event.event_name).slice(0, 10);
  const topRoutes = countBy(analyticsEvents, (event) => event.route).slice(0, 10);
  const displayModeCounts = countBy(analyticsEvents, (event) => {
    const displayMode = event.properties?.displayMode;
    return typeof displayMode === 'string' ? displayMode : null;
  });

  return NextResponse.json(
    {
      ownerEmail: data.user.email,
      generatedAt: now.toISOString(),
      analyticsReady: !analyticsResult.error,
      warnings: [
        usersResult.error ? `Unable to list auth users: ${usersResult.error}` : null,
        scenariosResult.error ? `Unable to count scenarios: ${scenariosResult.error}` : null,
        sharesResult.error ? `Unable to count shares: ${sharesResult.error}` : null,
        analyticsResult.error ? `Analytics table is not ready: ${analyticsResult.error.message}` : null,
        errorsResult.error ? `Unable to load client errors: ${errorsResult.error.message}` : null
      ].filter(Boolean),
      metrics: {
        totalUserAccounts: users.length,
        newAccountCount7d,
        totalScenarios: scenariosResult.count,
        totalShareLinks: sharesResult.count,
        activeToday: countDistinctUsersSince(analyticsEvents, today),
        active7d: countDistinctUsersSince(analyticsEvents, since7),
        active30d: countDistinctUsersSince(analyticsEvents, since30),
        totalEvents30d: analyticsEvents.length,
        pwaPromptShown30d: eventCount(analyticsEvents, 'pwa_install_prompt_shown'),
        pwaPromptAccepted30d: eventCount(analyticsEvents, 'pwa_install_prompt_accepted'),
        pwaInstalls30d: eventCount(analyticsEvents, 'pwa_installed'),
        scenarioCreated30d: eventCount(analyticsEvents, 'scenario_created'),
        shareLinksCreated30d: eventCount(analyticsEvents, 'share_link_created'),
        shareLinksOpened30d: eventCount(analyticsEvents, 'share_link_opened'),
        printOpens30d: eventCount(analyticsEvents, 'print_opened'),
        feedbackSent30d: eventCount(analyticsEvents, 'feedback_sent'),
        clientErrors7d: errorsResult.count ?? recentErrors.length
      },
      charts: {
        dailyEvents,
        dailyActive,
        topEvents,
        topRoutes,
        displayModeCounts
      },
      recentEvents: analyticsEvents.slice(0, 15).map((event) => ({
        eventName: event.event_name,
        createdAt: event.created_at,
        route: event.route,
        release: event.release,
        signedIn: Boolean(event.user_id)
      })),
      recentErrors
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
