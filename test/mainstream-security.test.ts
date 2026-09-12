import { test, vi } from 'vitest';
vi.mock('@/lib/supabaseServer', () => ({ getSupabaseAdminClient: () => null }));
import assert from 'node:assert/strict';
import { GET } from '@/app/api/listing-preview/route';
import { POST } from '@/app/api/client-errors/route';

test('Listing previews never fetch user-controlled destinations, including redirects and local targets', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response('<title>Unsafe upstream</title>'); };
  try {
    for (const url of ['https://127.0.0.1/', 'https://169.254.169.254/', 'https://[::1]/', 'https://example.com/redirect', 'https://user:pass@example.com/', 'file:///etc/passwd']) {
      await GET(new Request('https://dealcooker.test/api/listing-preview?url=' + encodeURIComponent(url)));
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test('Anonymous diagnostics reject cross-origin posts before parsing or storing', async () => {
  const response = await POST(new Request('https://www.dealcooker.app/api/client-errors', { method: 'POST', headers: { origin: 'https://attacker.invalid' }, body: '{}' }));
  assert.equal(response.status, 403);
});
