import { NextResponse } from 'next/server';

import { getSupabaseAdminClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

const resendApiKey = process.env.RESEND_API_KEY;
const dealReviewToEmail = process.env.DEAL_REVIEW_TO_EMAIL || process.env.FEEDBACK_TO_EMAIL || 'dillon@theinvestoragent.io';
const dealReviewFromEmail = process.env.DEAL_REVIEW_FROM_EMAIL || process.env.FEEDBACK_FROM_EMAIL || 'DealCooker <noreply@dealcooker.app>';
const dealReviewSubmissionsEnabled = process.env.DEAL_REVIEW_SUBMISSIONS_ENABLED === '1';
const MAX_FIELD_LENGTH = 240;
const MAX_NOTES_LENGTH = 1800;
const MAX_JSON_LENGTH = 18000;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const asString = (value: unknown, maxLength = MAX_FIELD_LENGTH): string => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asStringList = (value: unknown, maxItems = 12): string => {
  if (!Array.isArray(value)) return '';
  return value
    .slice(0, maxItems)
    .map((item) => asString(item, 60))
    .filter(Boolean)
    .join(', ');
};

const asNumberText = (value: unknown) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue.toLocaleString('en-US', { maximumFractionDigits: 2 }) : 'Not provided';
};

const asNullableNumber = (value: unknown): number | null => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const serializeSnapshot = (value: unknown) => {
  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized.length > MAX_JSON_LENGTH ? `${serialized.slice(0, MAX_JSON_LENGTH)}\n...truncated` : serialized;
  } catch {
    return 'Deal snapshot could not be serialized.';
  }
};

const dealReviewResponse = (error: string, status: number) =>
  NextResponse.json({ ok: false, error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  if (!dealReviewSubmissionsEnabled) {
    return dealReviewResponse('Paid deal analysis is coming soon.', 403);
  }

  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return dealReviewResponse('Invalid JSON.', 400);
  }

  const body = asRecord(rawBody);
  const contact = asRecord(body.contact);
  const context = asRecord(body.context);
  const requestDetails = asRecord(body.request);
  const deal = asRecord(body.deal);
  const result = asRecord(deal.result);
  const purchase = asRecord(deal.purchase);

  const name = asString(contact.name);
  const email = asString(contact.email);
  const phone = asString(contact.phone);
  const market = asString(requestDetails.market);
  const reviewFocus = asString(requestDetails.reviewFocus, 80) || 'General deal review';
  const notes = asString(requestDetails.notes, MAX_NOTES_LENGTH);
  const consentAccepted = requestDetails.consentAccepted === true;
  const activeDeal = asString(deal.dealName, 180) || asString(context.activeDeal, 180) || 'Not provided';
  const activeStrategy = asString(context.activeStrategy, 60) || asString(deal.activeStrategy, 60) || 'Not provided';
  const activeStrategyLabel = asString(deal.activeStrategyLabel, 80) || 'Not provided';
  const projectionStrategies = asStringList(context.projectionStrategies) || 'Not provided';
  const listingUrl = asString(deal.listingUrl, 500) || 'Not provided';
  const route = asString(context.route, 300) || 'unknown';
  const appRelease = asString(context.appRelease, 120) || 'unknown';
  const userAgent = asString(context.userAgent, 500) || asString(request.headers.get('user-agent'), 500) || 'unknown';
  const userId = asString(context.userId, 120);
  const userIdForStorage = uuidPattern.test(userId) ? userId : null;

  if (!email || !emailPattern.test(email)) {
    return dealReviewResponse('A valid email is required.', 400);
  }

  if (!consentAccepted) {
    return dealReviewResponse('Consent is required before sending this deal for review.', 400);
  }

  if (!resendApiKey) {
    console.error('Deal review email is not configured: missing RESEND_API_KEY.');
    return dealReviewResponse('Deal review email is not configured yet.', 503);
  }

  const submittedAt = new Date().toISOString();
  const emailText = [
    'DealCooker deal review request',
    '',
    'Request',
    `Submitted at: ${submittedAt}`,
    `Review focus: ${reviewFocus}`,
    `Market / location: ${market || 'Not provided'}`,
    `Notes: ${notes || 'Not provided'}`,
    `Consent accepted: ${String(consentAccepted)}`,
    '',
    'Contact',
    `Name: ${name || 'Not provided'}`,
    `Email: ${email}`,
    `Phone: ${phone || 'Not provided'}`,
    '',
    'Deal',
    `Deal name: ${activeDeal}`,
    `Listing URL: ${listingUrl}`,
    `Active strategy: ${activeStrategyLabel} (${activeStrategy})`,
    `Visible projections: ${projectionStrategies}`,
    `Purchase price: ${asNumberText(purchase.purchasePrice)}`,
    `Rehab budget: ${asNumberText(purchase.rehabBudget)}`,
    `ARV: ${asNumberText(purchase.arv)}`,
    `Monthly cash flow: ${asNumberText(result.monthlyCashFlow)}`,
    `Cash needed: ${asNumberText(result.totalCashNeeded)}`,
    `Cash-on-cash: ${asNumberText(result.cashOnCashReturn)}`,
    `ROI: ${asNumberText(result.roi)}`,
    `IRR: ${asNumberText(result.irr)}`,
    `DSCR: ${asNumberText(result.dscr)}`,
    '',
    'Context',
    `Source: ${asString(context.source, 60) || 'unknown'}`,
    `Route: ${route}`,
    `App release: ${appRelease}`,
    `Browser: ${userAgent}`,
    `Signed in: ${String(Boolean(context.signedIn))}`,
    `User ID: ${asString(context.userId, 120) || 'Not provided'}`,
    `Active deal ID: ${asString(context.activeDealId, 120) || 'Not provided'}`,
    `Saved deals: ${asNumberText(context.savedDealCount)}`,
    '',
    'Deal snapshot',
    serializeSnapshot(deal.snapshot)
  ].join('\n');

  let response: Response;

  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: dealReviewFromEmail,
        to: [dealReviewToEmail],
        reply_to: email,
        subject: `DealCooker review request (${market || activeStrategyLabel}) from ${name || email}`,
        text: emailText
      })
    });
  } catch (error) {
    console.error('Deal review email request failed:', error);
    return dealReviewResponse('Deal review email service is unreachable.', 502);
  }

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '');
    console.error('Deal review email rejected by Resend:', {
      status: response.status,
      body: responseBody.slice(0, 800)
    });
    return dealReviewResponse('Deal review email service rejected the request.', 502);
  }

  let stored = false;
  const supabase = getSupabaseAdminClient();

  if (supabase) {
    const { error } = await supabase.from('deal_review_requests').insert({
      user_id: userIdForStorage,
      contact_name: name || null,
      contact_email: email,
      contact_phone: phone || null,
      market: market || null,
      review_focus: reviewFocus,
      notes: notes || null,
      deal_name: activeDeal,
      listing_url: listingUrl === 'Not provided' ? null : listingUrl,
      active_strategy: activeStrategy,
      active_strategy_label: activeStrategyLabel === 'Not provided' ? null : activeStrategyLabel,
      purchase_price: asNullableNumber(purchase.purchasePrice),
      rehab_budget: asNullableNumber(purchase.rehabBudget),
      arv: asNullableNumber(purchase.arv),
      monthly_cash_flow: asNullableNumber(result.monthlyCashFlow),
      total_cash_needed: asNullableNumber(result.totalCashNeeded),
      cash_on_cash_return: asNullableNumber(result.cashOnCashReturn),
      roi: asNullableNumber(result.roi),
      irr: asNullableNumber(result.irr),
      dscr: asNullableNumber(result.dscr),
      payload_snapshot: deal.snapshot ?? {},
      context: {
        source: asString(context.source, 60) || 'unknown',
        route,
        appRelease,
        userAgent,
        signedIn: Boolean(context.signedIn),
        activeDealId: asString(context.activeDealId, 120) || null,
        projectionStrategies,
        savedDealCount: asNullableNumber(context.savedDealCount)
      }
    });

    if (error) {
      console.error('Deal review request storage failed:', error);
    } else {
      stored = true;
    }
  }

  return NextResponse.json({ ok: true, stored }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
