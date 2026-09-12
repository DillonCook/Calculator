import { createHash } from 'node:crypto';

const windows = new Map<string, { count: number; expires: number }>();
const MINUTE = 60_000;
// Instance-local backstop, not a substitute for distributed edge protection.
export function guardPublicRequest(request: Request, limit = 30, maxBytes = 32768): Response | null {
  const reject = (status: number, error: string) => Response.json({ ok: false, error }, {
    status, headers: { 'Cache-Control': 'no-store', ...(status === 429 ? { 'Retry-After': '60' } : {}) }
  });
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return reject(403, 'Request origin is not allowed.');
  if (request.headers.get('sec-fetch-site') === 'cross-site') return reject(403, 'Cross-site request is not allowed.');
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > maxBytes) return reject(413, 'Request is too large.');
  const now = Date.now();
  for (const [key, value] of windows) if (value.expires <= now) windows.delete(key);
  // Trust the hosting edge header only on Vercel; otherwise share an anonymous bucket.
  const identity = process.env.VERCEL ? request.headers.get('x-vercel-forwarded-for') ?? 'anonymous' : 'anonymous';
  const key = createHash('sha256').update(url.pathname + ':' + identity.slice(0, 200)).digest('hex');
  let bucket = windows.get(key);
  if (!bucket) {
    if (windows.size >= 5000) return reject(429, 'Please try again in a minute.');
    bucket = { count: 0, expires: now + MINUTE };
    windows.set(key, bucket);
  }
  if (++bucket.count > limit) return reject(429, 'Please try again in a minute.');
  return null;
}

export async function readBoundedJson(request: Request, maxBytes = 32768): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void reader.cancel(); }, 10_000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (timedOut) throw new Error('Request timed out');
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Request is too large');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { clearTimeout(timeout); await reader.cancel().catch(() => {}); }
}
