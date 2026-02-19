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
