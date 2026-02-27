import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseAdminConfigured = Boolean(supabaseUrl && supabaseServiceRoleKey);

let adminClient: SupabaseClient | null = null;

export const getSupabaseAdminClient = (): SupabaseClient | null => {
  if (!isSupabaseAdminConfigured) return null;

  if (!adminClient) {
    adminClient = createClient(supabaseUrl!, supabaseServiceRoleKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return adminClient;
};
