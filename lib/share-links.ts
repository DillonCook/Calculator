import { getSupabaseClient } from '@/lib/supabaseClient';
import type { DealInputModel } from '@/lib/models/deal';

const SHARES_TABLE = 'shares';
const SLUG_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const SLUG_LENGTH = 8;

export interface ShareLinkRecord {
  slug: string;
  payload_snapshot: DealInputModel;
  expires_at: string;
}

const generateSlug = () => {
  const values = new Uint8Array(SLUG_LENGTH);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => SLUG_CHARS[value % SLUG_CHARS.length]).join('');
};

const getShareExpiryIso = () => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  return expiresAt.toISOString();
};

export const createShortShareLink = async (params: {
  ownerId: string;
  scenarioId?: string;
  payloadSnapshot: DealInputModel;
}): Promise<{ slug: string; error: unknown | null }> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { slug: '', error: new Error('Supabase is not configured.') };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const slug = generateSlug();
    const { error } = await supabase.from(SHARES_TABLE).insert({
      slug,
      owner_id: params.ownerId,
      scenario_id: params.scenarioId ?? null,
      payload_snapshot: params.payloadSnapshot,
      is_public: true,
      expires_at: getShareExpiryIso()
    });

    if (!error) {
      return { slug, error: null };
    }

    const code = (error as { code?: string }).code;
    if (code !== '23505') {
      return { slug: '', error };
    }
  }

  return { slug: '', error: new Error('Unable to create a unique short slug.') };
};

export const fetchShareBySlug = async (slug: string): Promise<{ share: ShareLinkRecord | null; error: unknown | null }> => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { share: null, error: new Error('Supabase is not configured.') };
  }

  const { data, error } = await supabase
    .from(SHARES_TABLE)
    .select('slug, payload_snapshot, expires_at')
    .eq('slug', slug)
    .eq('is_public', true)
    .single();

  if (error || !data) {
    return { share: null, error: error ?? new Error('Share not found.') };
  }

  const share = data as ShareLinkRecord;

  if (new Date(share.expires_at).getTime() < Date.now()) {
    return { share: null, error: new Error('Link expired') };
  }

  return { share, error: null };
};
