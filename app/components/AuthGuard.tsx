'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getSessionSafe } from '@/lib/supabaseAuthSafe';
import { t } from '@/lib/translations';

function isInvalidRefreshTokenError(message: string | undefined): boolean {
  const text = String(message || '').toLowerCase();
  return text.includes('invalid refresh token') || text.includes('refresh token not found');
}

function isAuthLockAbortError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("lock broken by another request");
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const isSuperadminAllowedPath = (path: string | null) => {
    if (!path) return false;
    return path === '/admin' || path.startsWith('/admin/');
  };

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let hardRedirectTimer: ReturnType<typeof setTimeout> | null = null;

    const redirectToLogin = () => {
      router.replace('/login');
      // Fallback in case client navigation gets stuck during auth races.
      hardRedirectTimer = setTimeout(() => {
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.assign('/login');
        }
      }, 180);
    };

    const checkAuth = async () => {
      try {
        if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
          router.replace(`/auth/reset-password${window.location.hash}`);
          return;
        }

        let session = null;
        let error: Error | null = null;
        try {
          session = await getSessionSafe();
        } catch (authError: unknown) {
          error = authError instanceof Error ? authError : new Error(String(authError));
        }

        if (error && isInvalidRefreshTokenError(error.message)) {
          // Clear broken local auth state so future checks don't keep throwing.
          await supabase.auth.signOut({ scope: 'local' });
        }

        if (!session) {
          if (!cancelled) {
            setAuthenticated(false);
            setLoading(false);
            redirectToLogin();
          }
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();
        const role = (profile?.role ?? 'user') as 'superadmin' | 'user';

        if (!cancelled && role === 'superadmin' && !isSuperadminAllowedPath(pathname)) {
          setAuthenticated(true);
          setLoading(false);
          router.replace('/admin');
          return;
        }

        if (!cancelled) {
          setAuthenticated(true);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (isAuthLockAbortError(err)) {
          // Supabase auth lock collision (multiple session reads at once).
          // Retry shortly instead of surfacing a runtime abort to the UI.
          retryTimer = setTimeout(() => {
            void checkAuth();
          }, 80);
          return;
        }
        if (!cancelled) {
          setAuthenticated(false);
          setLoading(false);
          redirectToLogin();
        }
      }
    };

    void checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setAuthenticated(false);
        setLoading(false);
        redirectToLogin();
      } else {
        setAuthenticated(true);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (hardRedirectTimer) clearTimeout(hardRedirectTimer);
      subscription.unsubscribe();
    };
  }, [router, pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fb]">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-4 text-gray-600">{t.loading}</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fb]">
        <p className="text-sm text-gray-600">Preusmjeravam na login...</p>
      </div>
    );
  }

  return <>{children}</>;
}
