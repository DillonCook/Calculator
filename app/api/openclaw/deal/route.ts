import { NextResponse } from 'next/server';

import { calculateDeal } from '@/lib/engine/deal-engine';
import { type StrategyKey } from '@/lib/models/deal';
import { decodeDealFromShareParam, normalizeDealInput } from '@/lib/share-link';
import { createShortShareLink } from '@/lib/share-links';
import { getSupabaseAdminClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

const strategyKeys: StrategyKey[] = ['purchase', 'longTerm', 'airbnb', 'padSplit', 'brrrr', 'flip'];
const strategySet = new Set<StrategyKey>(strategyKeys);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const hasOwn = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const resolveApiKeyFromRequest = (request: Request): string | null => {
  const apiKeyHeader = asNonEmptyString(request.headers.get('x-openclaw-key'));
  if (apiKeyHeader) return apiKeyHeader;

  const authHeader = asNonEmptyString(request.headers.get('authorization'));
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  return asNonEmptyString(authHeader.slice(7));
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
};

export async function POST(request: Request) {
  const expectedApiKey = asNonEmptyString(process.env.OPENCLAW_API_KEY);
  if (!expectedApiKey) {
    return NextResponse.json(
      { error: 'OPENCLAW_API_KEY is not configured on the server.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const providedApiKey = resolveApiKeyFromRequest(request);
  if (!providedApiKey || providedApiKey !== expectedApiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const body = isRecord(rawBody) ? rawBody : null;
  if (!body) {
    return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const hasWrappedPayload = hasOwn(body, 'deal') || hasOwn(body, 'payload');
  const hasShareParam = hasOwn(body, 'shareParam');
  const hasInlineDealShape =
    hasOwn(body, 'purchase') ||
    hasOwn(body, 'commercial') ||
    hasOwn(body, 'longTerm') ||
    hasOwn(body, 'airbnb') ||
    hasOwn(body, 'padSplit') ||
    hasOwn(body, 'brrrr') ||
    hasOwn(body, 'flip');

  if (!hasWrappedPayload && !hasInlineDealShape && !hasShareParam) {
    return NextResponse.json(
      { error: 'Missing deal payload. Send `deal`, `payload`, inline deal fields, or `shareParam`.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const shareParam = asNonEmptyString(body.shareParam);
  const rawDeal = hasWrappedPayload ? body.deal ?? body.payload : hasInlineDealShape ? body : null;
  const normalizedDeal = (shareParam ? decodeDealFromShareParam(shareParam) : null) ?? (rawDeal ? normalizeDealInput(rawDeal) : null);

  if (!normalizedDeal) {
    return NextResponse.json({ error: 'Unable to parse deal payload.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const result = calculateDeal(normalizedDeal);
  const requestedStrategy = asNonEmptyString(body.strategy);
  const strategy = requestedStrategy && strategySet.has(requestedStrategy as StrategyKey) ? (requestedStrategy as StrategyKey) : 'purchase';

  const shouldCreateShortLink = body.createShortLink !== false;
  let shortLink: { slug: string; url: string } | null = null;
  let shortLinkError: string | null = null;

  if (shouldCreateShortLink) {
    const ownerId = asNonEmptyString(body.ownerId) ?? asNonEmptyString(process.env.OPENCLAW_OWNER_USER_ID);
    const scenarioId = asNonEmptyString(body.scenarioId) ?? undefined;

    if (!ownerId) {
      shortLinkError = 'Missing ownerId. Provide ownerId in the request or set OPENCLAW_OWNER_USER_ID.';
    } else {
      const adminClient = getSupabaseAdminClient();
      if (!adminClient) {
        shortLinkError = 'Supabase admin client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.';
      } else {
        const { slug, error } = await createShortShareLink(
          {
            ownerId,
            scenarioId,
            payloadSnapshot: normalizedDeal
          },
          adminClient
        );

        if (error || !slug) {
          shortLinkError = toErrorMessage(error);
        } else {
          const origin = new URL(request.url).origin;
          shortLink = {
            slug,
            url: `${origin}/s/${slug}`
          };
        }
      }
    }
  }

  return NextResponse.json(
    {
      ok: true,
      strategy,
      strategyOutput: result[strategy],
      masterSummary: result.masterSummary,
      fullResult: result,
      shortLink,
      shortLinkError
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
