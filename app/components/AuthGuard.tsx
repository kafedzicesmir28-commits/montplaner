'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { t } from '@/lib/translations';

function isInvalidRefreshTokenError(message: string | undefined): boolean {
  const text = String(message || '').toLowerCase();
  return text.includes('invalid refresh token') || text.includes('refresh token not found');
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
    const checkAuth = async () => {
      if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
        router.replace(`/auth/reset-password${window.location.hash}`);
        return;
      }

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error && isInvalidRefreshTokenError(error.message)) {
        // Clear broken local auth state so future checks don't keep throwing.
        await supabase.auth.signOut({ scope: 'local' });
      }

      if (!session) {
        setAuthenticated(false);
        setLoading(false);
        router.replace('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      const role = (profile?.role ?? 'user') as 'superadmin' | 'user';

      if (role === 'superadmin' && !isSuperadminAllowedPath(pathname)) {
        setAuthenticated(true);
        setLoading(false);
        router.replace('/admin');
        return;
      }

      setAuthenticated(true);
      setLoading(false);
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setAuthenticated(false);
        setLoading(false);
        router.replace('/login');
      } else {
        setAuthenticated(true);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
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
    return null;
  }

  return <>{children}</>;
}
