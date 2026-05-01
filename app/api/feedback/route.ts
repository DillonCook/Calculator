import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const resendApiKey = process.env.RESEND_API_KEY;
const feedbackToEmail = process.env.FEEDBACK_TO_EMAIL || 'dillon@theinvestoragent.io';
const feedbackFromEmail = process.env.FEEDBACK_FROM_EMAIL || 'DealCooker <noreply@dealcooker.app>';
const MAX_MESSAGE_LENGTH = 1600;
const MAX_FIELD_LENGTH = 220;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    .map((item) => asString(item, 40))
    .filter(Boolean)
    .join(', ');
};

const feedbackResponse = (error: string, status: number) =>
  NextResponse.json({ ok: false, error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return feedbackResponse('Invalid JSON.', 400);
  }

  const body = asRecord(rawBody);
  const contact = asRecord(body.contact);
  const context = asRecord(body.context);
  const message = asString(body.message, MAX_MESSAGE_LENGTH);
  const email = asString(contact.email);
  const name = asString(contact.name);
  const phone = asString(contact.phone);
  const source = asString(context.source, 40) || 'unknown';
  const viewport = asString(context.viewport, 40) || 'unknown';
  const route = asString(context.route, 300) || 'unknown';
  const appRelease = asString(context.appRelease, 120) || 'unknown';
  const userAgent = asString(context.userAgent, 500) || asString(request.headers.get('user-agent'), 500) || 'unknown';
  const activeDeal = asString(context.activeDeal, 180) || 'Not provided';
  const activeDealId = asString(context.activeDealId, 120) || 'Not provided';
  const activeStrategy = asString(context.activeStrategy, 40) || 'Not provided';
  const projectionStrategies = asStringList(context.projectionStrategies) || 'Not provided';
  const savedDealCount = Number.isFinite(Number(context.savedDealCount)) ? String(Number(context.savedDealCount)) : 'unknown';

  if (!message) {
    return feedbackResponse('Missing feedback message.', 400);
  }

  if (!email || !emailPattern.test(email)) {
    return feedbackResponse('A valid email is required.', 400);
  }

  if (!resendApiKey) {
    console.error('Feedback email is not configured: missing RESEND_API_KEY.');
    return feedbackResponse('Feedback email is not configured yet.', 503);
  }

  const submittedAt = new Date().toISOString();
  const emailText = [
    'DealCooker feedback',
    '',
    message,
    '',
    'Contact',
    `Name: ${name || 'Not provided'}`,
    `Email: ${email}`,
    `Phone: ${phone || 'Not provided'}`,
    '',
    'Context',
    `Submitted at: ${submittedAt}`,
    `Source: ${source}`,
    `Viewport: ${viewport}`,
    `Route: ${route}`,
    `App release: ${appRelease}`,
    `Browser: ${userAgent}`,
    `Signed in: ${String(Boolean(context.signedIn))}`,
    `User ID: ${asString(context.userId, 120) || 'Not provided'}`,
    `Active deal: ${activeDeal}`,
    `Active deal ID: ${activeDealId}`,
    `Active strategy: ${activeStrategy}`,
    `Visible projections: ${projectionStrategies}`,
    `Saved deals: ${savedDealCount}`
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
        from: feedbackFromEmail,
        to: [feedbackToEmail],
        reply_to: email,
        subject: `DealCooker feedback (${source}/${viewport}) from ${name || email}`,
        text: emailText
      })
    });
  } catch (error) {
    console.error('Feedback email request failed:', error);
    return feedbackResponse('Feedback email service is unreachable.', 502);
  }

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '');
    console.error('Feedback email rejected by Resend:', {
      status: response.status,
      body: responseBody.slice(0, 800)
    });
    return feedbackResponse('Feedback email service rejected the request.', 502);
  }

  return NextResponse.json({ ok: true }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
