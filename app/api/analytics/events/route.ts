import { NextResponse } from 'next/server';

import { getSupabaseAdminClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

const MAX_ROUTE_LENGTH = 220;
const MAX_RELEASE_LENGTH = 120;
const allowedEventNamePattern = /^[a-z0-9_:. -]{2,80}$/;
const allowedEventNames = new Set([
  'app_opened',
  'deal_review_requested',
  'feedback_sent',
  'marketing_entry',
  'pwa_installed',
  'pwa_install_prompt_accepted',
  'pwa_install_prompt_available',
  'pwa_install_prompt_dismissed',
  'pwa_install_prompt_requested',
  'pwa_install_prompt_shown',
  'scenario_created',
  'scenario_deleted',
  'scenario_duplicated',
  'scenario_imported',
  'scenario_sample_loaded',
  'share_link_created',
  'share_link_open_failed',
  'share_link_opened',
  'strategy_selected',
  'print_opened'
]);

const asString = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
};

const asProperties = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 24)
      .filter(([, propertyValue]) => propertyValue === null || ['string', 'number', 'boolean'].includes(typeof propertyValue))
      .map(([key, propertyValue]) => [key.slice(0, 80), typeof propertyValue === 'string' ? propertyValue.slice(0, 220) : propertyValue])
  );
};

const getBearerToken = (request: Request) => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim() || null;
};

export async function POST(request: Request) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? (rawBody as Record<string, unknown>) : null;
  const eventName = asString(body?.eventName, 80);

  if (!body || !eventName || !allowedEventNamePattern.test(eventName) || !allowedEventNames.has(eventName)) {
    return NextResponse.json({ ok: false, error: 'Invalid event name.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: true, stored: false }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  }

  const token = getBearerToken(request);
  const { data } = token ? await supabase.auth.getUser(token) : { data: { user: null } };

  const { error } = await supabase.from('analytics_events').insert({
    event_name: eventName,
    user_id: data.user?.id ?? null,
    anonymous_id: asString(body.anonymousId, 120),
    session_id: asString(body.sessionId, 120),
    route: asString(body.route, MAX_ROUTE_LENGTH),
    release: asString(body.release, MAX_RELEASE_LENGTH),
    properties: asProperties(body.properties)
  });

  if (error) {
    return NextResponse.json({ ok: false, stored: false }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({ ok: true, stored: true }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
