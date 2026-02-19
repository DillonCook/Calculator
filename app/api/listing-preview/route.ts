import { NextResponse } from 'next/server';

import {
  extractDealNameFromListingHtml,
  extractDealNameFromOneHomeEmailToken,
  extractOneHomeSetIdFromEmailToken,
  extractOneHomeSetIdFromShareCode,
  extractOneHomeShareCode,
  normalizeListingUrl
} from '@/lib/listing-link';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

interface OneHomeCheckShareResponse {
  emailToken?: string;
}

interface OneHomeCheckTokenResponse {
  mlsID?: string;
  listingID?: string | null;
  groupID?: string | null;
  sessionToken?: string;
}

interface OneHomeListingByIdResponse {
  data?: {
    listingDetail?: {
      property?: {
        StreetNumber?: string;
        StreetName?: string;
        StreetSuffix?: string;
        StreetDirPrefix?: string;
        StreetDirSuffix?: string;
        UnitNumber?: string;
        City?: string;
        PostalCity?: string;
      };
    };
  };
}

const formatOneHomeAddress = (property: OneHomeListingByIdResponse['data'] extends infer D
  ? D extends { listingDetail?: { property?: infer P } }
    ? P
    : never
  : never): string | null => {
  if (!property) return null;

  const street = [
    property.StreetNumber,
    property.StreetDirPrefix,
    property.StreetName,
    property.StreetSuffix,
    property.StreetDirSuffix
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

  const city = (property.City || property.PostalCity || '').trim();
  const unit = property.UnitNumber?.trim();
  if (!street || !city) return null;

  return `${street}${unit ? ` Unit ${unit}` : ''}, ${city}`;
};

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T | null> => {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        'user-agent': BROWSER_UA,
        ...(init?.headers ?? {})
      },
      next: { revalidate: 0 }
    });

    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const resolveOneHomeDealName = async (listingUrl: string): Promise<string | null> => {
  const shareCode = extractOneHomeShareCode(listingUrl);
  if (!shareCode) return null;
  const fallbackSetId = extractOneHomeSetIdFromShareCode(shareCode);

  const shareData = await fetchJson<OneHomeCheckShareResponse>(
    `https://services.onehome.com/api/authentication/checkShare/${encodeURIComponent(shareCode)}`
  );
  const emailToken = shareData?.emailToken;
  if (!emailToken) return fallbackSetId ? `OneHome Listing ${fallbackSetId}` : null;

  const fromEmailToken = extractDealNameFromOneHomeEmailToken(emailToken);
  if (fromEmailToken && !fromEmailToken.startsWith('OneHome Listing ')) {
    return fromEmailToken;
  }

  const tokenCheck = await fetchJson<OneHomeCheckTokenResponse>('https://services.onehome.com/api/authentication/checkToken', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ emailToken })
  });

  if (tokenCheck?.sessionToken && tokenCheck.groupID && tokenCheck.listingID) {
    const listingQuery = {
      query: `query ListingById($listingId: String!, $groupId: String!, $savedSearchId: String, $suppressEvent: Boolean = true) {
        listingDetail(listingId: $listingId, groupId: $groupId, savedSearchId: $savedSearchId, suppressEvent: $suppressEvent) {
          property {
            StreetNumber
            StreetDirPrefix
            StreetName
            StreetSuffix
            StreetDirSuffix
            UnitNumber
            City
            PostalCity
          }
        }
      }`,
      variables: {
        listingId: tokenCheck.listingID,
        groupId: tokenCheck.groupID,
        savedSearchId: null,
        suppressEvent: true
      }
    };

    const listingById = await fetchJson<OneHomeListingByIdResponse>('https://services.onehome.com/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${tokenCheck.sessionToken}`
      },
      body: JSON.stringify(listingQuery)
    });

    const formattedAddress = formatOneHomeAddress(listingById?.data?.listingDetail?.property);
    if (formattedAddress) return formattedAddress;
  }

  const setId = extractOneHomeSetIdFromEmailToken(emailToken);
  if (setId && tokenCheck?.mlsID) {
    return `${tokenCheck.mlsID} Listing ${setId}`;
  }

  return setId ? `OneHome Listing ${setId}` : fallbackSetId ? `OneHome Listing ${fallbackSetId}` : fromEmailToken;
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

  if (extractOneHomeShareCode(listingUrl)) {
    return NextResponse.json({ dealName: null, error: 'OneHome blocks address data for this share link. Please enter address manually.' }, { status: 200 });
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
