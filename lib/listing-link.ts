const STREET_SUFFIXES = new Set([
  'st',
  'street',
  'ave',
  'avenue',
  'rd',
  'road',
  'dr',
  'drive',
  'ln',
  'lane',
  'blvd',
  'boulevard',
  'ct',
  'court',
  'cir',
  'circle',
  'way',
  'trl',
  'trail',
  'pl',
  'place',
  'ter',
  'terrace',
  'pkwy',
  'parkway'
]);

const ADDRESS_PATTERN = /\b(\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,5}\s(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Cir|Circle|Way|Trl|Trail|Pl|Place|Ter|Terrace|Pkwy|Parkway))\s*,\s*([A-Za-z][A-Za-z\s.'-]{1,30})\b/i;

const toTitleCase = (value: string) =>
  value
    .toLowerCase()
    .split(' ')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');

const splitAddressParts = (slug: string) =>
  slug
    .split(/[-_]/)
    .map((part) => part.trim())
    .filter(Boolean);

const findStreetEndIndex = (parts: string[]) => {
  const maxScan = Math.min(parts.length, 8);
  for (let index = 1; index < maxScan; index += 1) {
    if (STREET_SUFFIXES.has(parts[index].toLowerCase().replace('.', ''))) {
      return index;
    }
  }

  return -1;
};

const extractAddressFromParts = (parts: string[]): string | null => {
  if (parts.length < 4 || !/^\d+[a-zA-Z]?$/.test(parts[0])) return null;

  const streetEndIndex = findStreetEndIndex(parts);
  if (streetEndIndex < 1 || streetEndIndex + 1 >= parts.length) return null;

  const street = toTitleCase(parts.slice(0, streetEndIndex + 1).join(' '));
  const city = toTitleCase(parts[streetEndIndex + 1]);

  return `${street}, ${city}`;
};

const candidateSlugsFromPath = (pathname: string): string[] => {
  const clean = pathname.replace(/^\/+|\/+$/g, '');
  if (!clean) return [];

  const segments = clean.split('/').filter(Boolean);
  return segments
    .flatMap((segment) => segment.split(/\.html?$/i))
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => /\d/.test(value) && value.includes('-'));
};

const extractAddressFromText = (input: string): string | null => {
  const match = input.match(ADDRESS_PATTERN);
  if (!match) return null;

  const street = toTitleCase(match[1].replace(/\s+/g, ' ').trim());
  const city = toTitleCase(match[2].replace(/\s+/g, ' ').trim());
  return `${street}, ${city}`;
};

const extractMetaContent = (html: string, property: string): string | null => {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  const match = html.match(regex);
  return match?.[1]?.trim() || null;
};

const extractTitle = (html: string): string | null => {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() || null;
};

export const normalizeListingUrl = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withScheme);
    return parsed.toString();
  } catch {
    return trimmed;
  }
};

export const extractDealNameFromListingUrl = (raw: string): string | null => {
  const normalized = normalizeListingUrl(raw);

  try {
    const parsed = new URL(normalized);
    const candidates = candidateSlugsFromPath(parsed.pathname);

    for (const slug of candidates) {
      const address = extractAddressFromParts(splitAddressParts(slug));
      if (address) return address;
    }

    return null;
  } catch {
    return null;
  }
};

export const extractDealNameFromListingHtml = (html: string): string | null => {
  if (!html.trim()) return null;

  const candidates = [
    extractMetaContent(html, 'og:title'),
    extractMetaContent(html, 'twitter:title'),
    extractMetaContent(html, 'description'),
    extractTitle(html)
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const extracted = extractAddressFromText(candidate);
    if (extracted) return extracted;
  }

  return extractAddressFromText(html);
};


export const extractOneHomeShareCode = (raw: string): string | null => {
  const normalized = normalizeListingUrl(raw);

  try {
    const parsed = new URL(normalized);
    if (!parsed.hostname.endsWith('onehome.com')) return null;

    const match = parsed.pathname.match(/\/share\/([^/?#]+)/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
};

const decodeBase64Url = (input: string): string | null => {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = `${normalized}${normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))}`;

    if (typeof atob === 'function') {
      const binary = atob(padded);
      return decodeURIComponent(
        Array.from(binary)
          .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
          .join('')
      );
    }

    if (typeof Buffer !== 'undefined') {
      return Buffer.from(padded, 'base64').toString('utf8');
    }

    return null;
  } catch {
    return null;
  }
};



export const decodeOneHomeEmailTokenPayload = (emailToken: string): Record<string, unknown> | null => {
  const decoded = decodeBase64Url(emailToken);
  if (!decoded) return null;

  try {
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const extractOneHomeSetIdFromEmailToken = (emailToken: string): string | null => {
  const payload = decodeOneHomeEmailTokenPayload(emailToken);
  const setIdRaw = payload?.setid;
  return typeof setIdRaw === 'string' && setIdRaw.trim() ? setIdRaw.trim() : null;
};

export const extractDealNameFromOneHomeEmailToken = (emailToken: string): string | null => {
  const payload = decodeOneHomeEmailTokenPayload(emailToken);
  if (!payload) return null;

  for (const value of Object.values(payload)) {
    if (typeof value !== 'string') continue;
    const extracted = extractAddressFromText(value);
    if (extracted) return extracted;
  }

  const setIdRaw = payload.setid;
  if (typeof setIdRaw === 'string' && setIdRaw.trim()) {
    return `OneHome Listing ${setIdRaw.trim()}`;
  }

  return null;
};


export const extractOneHomeSetIdFromShareCode = (shareCode: string): string | null => {
  const match = shareCode.match(/^(\d+)G/i);
  return match?.[1] ?? null;
};
