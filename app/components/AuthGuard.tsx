'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { loadTenantFromSession, type ProfileRole } from '@/lib/tenantProfile';
import { CompanyProvider } from '@/contexts/CompanyContext';
import { t } from '@/lib/translations';

function isInvalidRefreshTokenError(message: string | undefined): boolean {
  const text = String(message || '').toLowerCase();
  return text.includes('invalid refresh token') || text.includes('refresh token not found');
}

type Tenant = { companyId: string | null; role: ProfileRole };

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const applySession = async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (cancelled) return;

      if (error && isInvalidRefreshTokenError(error.message)) {
        await supabase.auth.signOut({ scope: 'local' });
        setTenant(null);
        setProfileError(null);
        setLoading(false);
        return;
      }

      if (!session) {
        setTenant(null);
        setProfileError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const result = await loadTenantFromSession(session);
      if (cancelled) return;

      if (!result.ok) {
        setTenant(null);
        if (result.reason === 'missing_profile') {
          setProfileError(t.profileMissingProfile);
        } else if (result.reason === 'missing_company') {
          setProfileError(t.profileMissingCompany);
        } else if (result.reason === 'profile_fetch') {
          setProfileError(result.message || t.profileAccessErrorGeneric);
        } else if (result.reason === 'invalid_role') {
          setProfileError(t.profileInvalidRole);
        } else {
          setProfileError(t.profileAccessErrorGeneric);
        }
        setLoading(false);
        return;
      }

      setTenant({ companyId: result.companyId, role: result.role });
      setProfileError(null);
      setLoading(false);
    };

    void applySession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        if (cancelled) return;
        if (!session) {
          setTenant(null);
          setProfileError(null);
          setLoading(false);
          return;
        }
        setLoading(true);
        const result = await loadTenantFromSession(session);
        if (cancelled) return;
        if (!result.ok) {
          setTenant(null);
          if (result.reason === 'missing_profile') {
            setProfileError(t.profileMissingProfile);
          } else if (result.reason === 'missing_company') {
            setProfileError(t.profileMissingCompany);
          } else if (result.reason === 'profile_fetch') {
            setProfileError(result.message || t.profileAccessErrorGeneric);
          } else if (result.reason === 'invalid_role') {
            setProfileError(t.profileInvalidRole);
          } else {
            setProfileError(t.profileAccessErrorGeneric);
          }
          setLoading(false);
          return;
        }
        setTenant({ companyId: result.companyId, role: result.role });
        setProfileError(null);
        setLoading(false);
      })();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useLayoutEffect(() => {
    if (loading || !tenant || profileError) return;
    if (tenant.role !== 'superadmin') return;
    const path = pathname || '';
    if (path === '/admin' || path.startsWith('/admin/')) return;
    window.location.replace('/admin');
  }, [loading, tenant, profileError, pathname]);

  useEffect(() => {
    if (!loading && !tenant && !profileError) {
      window.location.replace('/login');
    }
  }, [loading, tenant, profileError]);

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

  if (profileError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#f8f9fb] px-4">
        <div className="max-w-md rounded-lg border border-amber-200 bg-amber-50 p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-amber-900">{t.profileAccessErrorGeneric}</p>
          <p className="mt-3 text-sm text-amber-800">{profileError}</p>
          <button
            type="button"
            className="mt-5 rounded-md bg-amber-900 px-4 py-2 text-sm font-medium text-white hover:bg-amber-950"
            onClick={async () => {
              try {
                await supabase.auth.signOut();
              } finally {
                window.location.replace('/login');
              }
            }}
          >
            {t.profileSignOutAndRetry}
          </button>
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fb]">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-4 text-gray-600">{t.redirectingToLogin}</p>
        </div>
      </div>
    );
  }

  const path = pathname || '';
  const superadminOnAllowedRoute =
    tenant.role === 'superadmin' && (path === '/admin' || path.startsWith('/admin/'));
  if (tenant.role === 'superadmin' && !superadminOnAllowedRoute) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fb]">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-4 text-gray-600">{t.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <CompanyProvider companyId={tenant.companyId} role={tenant.role}>
      {children}
    </CompanyProvider>
  );
}
