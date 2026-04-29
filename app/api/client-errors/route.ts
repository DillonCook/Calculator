import { NextResponse } from 'next/server';

import { getSupabaseAdminClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

const MAX_STRING_LENGTH = 700;
const MAX_STACK_LENGTH = 1800;
const allowedSeverities = new Set(['info', 'warning', 'error']);

const asString = (value: unknown, maxLength = MAX_STRING_LENGTH): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
};

const asMetadata = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export async function POST(request: Request) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? (rawBody as Record<string, unknown>) : null;
  const message = asString(body?.message);
  const source = asString(body?.source, 80);

  if (!body || !message || !source) {
    return NextResponse.json(
      { ok: false, error: 'Missing source or message.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: true, stored: false }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  }

  const severity = asString(body.severity, 20);
  const { error } = await supabase.from('client_error_events').insert({
    source,
    message,
    severity: severity && allowedSeverities.has(severity) ? severity : 'error',
    operation: asString(body.operation, 80),
    stack: asString(body.stack, MAX_STACK_LENGTH),
    user_id: asString(body.userId, 80),
    route: asString(body.route, 220),
    release: asString(body.release, 120),
    metadata: asMetadata(body.metadata)
  });

  if (error) {
    return NextResponse.json({ ok: false }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({ ok: true, stored: true }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
