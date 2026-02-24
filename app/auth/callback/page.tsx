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
      const oauthError = url.searchParams.get('error_description') ?? url.searchParams.get('error');

      if (oauthError) {
        router.replace(`/?authError=${encodeURIComponent(oauthError)}`);
        return;
      }

      if (authCode) {
        const { error } = await supabase.auth.exchangeCodeForSession(authCode);
        if (error) {
          router.replace(`/?authError=${encodeURIComponent(error.message)}`);
          return;
        }
      } else if (url.hash) {
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });

          if (error) {
            router.replace(`/?authError=${encodeURIComponent(error.message)}`);
            return;
          }
        }
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
