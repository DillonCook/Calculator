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

export async function POST(request: Request) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const body = asRecord(rawBody);
  const contact = asRecord(body.contact);
  const context = asRecord(body.context);
  const message = asString(body.message, MAX_MESSAGE_LENGTH);
  const email = asString(contact.email);
  const name = asString(contact.name);
  const phone = asString(contact.phone);

  if (!message) {
    return NextResponse.json({ ok: false, error: 'Missing feedback message.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  if (!email || !emailPattern.test(email)) {
    return NextResponse.json({ ok: false, error: 'A valid email is required.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  if (!resendApiKey) {
    return NextResponse.json({ ok: false, error: 'Feedback email is not configured.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
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
    `Source: ${asString(context.source, 40) || 'unknown'}`,
    `Viewport: ${asString(context.viewport, 40) || 'unknown'}`,
    `Route: ${asString(context.route, 300) || 'unknown'}`,
    `Signed in: ${String(Boolean(context.signedIn))}`,
    `User ID: ${asString(context.userId, 120) || 'Not provided'}`,
    `Active deal: ${asString(context.activeDeal, 180) || 'Not provided'}`
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
        subject: `DealCooker feedback from ${name || email}`,
        text: emailText
      })
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Unable to send feedback.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }

  if (!response.ok) {
    return NextResponse.json({ ok: false, error: 'Unable to send feedback.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({ ok: true }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
