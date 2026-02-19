import { NextResponse } from 'next/server';

import {
  extractDealNameFromListingHtml,
  extractDealNameFromOneHomeEmailToken,
  extractOneHomeShareCode,
  normalizeListingUrl
} from '@/lib/listing-link';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const resolveOneHomeDealName = async (listingUrl: string): Promise<string | null> => {
  const shareCode = extractOneHomeShareCode(listingUrl);
  if (!shareCode) return null;

  try {
    const response = await fetch(`https://services.onehome.com/api/authentication/checkShare/${encodeURIComponent(shareCode)}`, {
      headers: { 'user-agent': BROWSER_UA },
      next: { revalidate: 0 }
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as { emailToken?: string };
    if (!payload.emailToken) return null;

    return extractDealNameFromOneHomeEmailToken(payload.emailToken);
  } catch {
    return null;
  }
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get('url')?.trim() ?? '';
  const listingUrl = normalizeListingUrl(rawUrl);

  if (!listingUrl) {
    return NextResponse.json({ dealName: null, error: 'Missing url parameter' }, { status: 400 });
  }

  const oneHomeDealName = await resolveOneHomeDealName(listingUrl);
  if (oneHomeDealName) {
    return NextResponse.json({ dealName: oneHomeDealName });
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
