import { NextResponse } from 'next/server';

import { extractDealNameFromListingHtml, isOneHomeUrl, normalizeListingUrl } from '@/lib/listing-link';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get('url')?.trim() ?? '';
  const listingUrl = normalizeListingUrl(rawUrl);

  if (!listingUrl) {
    return NextResponse.json({ dealName: null, error: 'Missing url parameter' }, { status: 400 });
  }

  if (isOneHomeUrl(listingUrl)) {
    return NextResponse.json({ dealName: null }, { status: 200 });
  }

  try {
    const response = await fetch(listingUrl, {
      redirect: 'follow',
      headers: { 'user-agent': BROWSER_UA },
      next: { revalidate: 0 }
    });

    if (!response.ok) {
      return NextResponse.json({ dealName: null, error: `Upstream ${response.status}` }, { status: 502 });
    }

    const html = await response.text();
    const dealName = extractDealNameFromListingHtml(html);

    return NextResponse.json({ dealName });
  } catch {
    return NextResponse.json({ dealName: null, error: 'Unable to fetch listing URL' }, { status: 502 });
  }
}
