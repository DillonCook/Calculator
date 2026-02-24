'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabaseClient';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const completeSignIn = async () => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        router.replace('/');
        return;
      }

      const url = new URL(window.location.href);
      const authCode = url.searchParams.get('code');

      if (authCode) {
        await supabase.auth.exchangeCodeForSession(authCode);
      }

      router.replace('/');
    };

    completeSignIn();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <p className="text-sm text-muted">Completing sign-in…</p>
    </main>
  );
}
