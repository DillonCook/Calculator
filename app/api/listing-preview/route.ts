import { NextResponse } from 'next/server';
import { extractDealNameFromListingUrl, normalizeListingUrl } from '@/lib/listing-link';

// Name-only convenience, deliberately network-free. A listing URL must never
// become a server-side fetch capability (including redirect/DNS rebinding).
export async function GET(request: Request) {
  const rawUrl = new URL(request.url).searchParams.get('url')?.trim() ?? '';
  if (!rawUrl || rawUrl.length > 2048) {
    return NextResponse.json({ dealName: null, error: 'Enter a listing link under 2,048 characters.' }, { status: 400 });
  }
  try {
    const url = new URL(normalizeListingUrl(rawUrl));
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid listing URL');
    return NextResponse.json({
      dealName: extractDealNameFromListingUrl(url.href),
      source: 'url-only',
      notice: 'Name suggestion only. Property facts, price, income and expenses are not imported.'
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ dealName: null, error: 'Enter a valid public listing link.' }, { status: 400 });
  }
}
