'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { loadTenantFromSession } from '@/lib/tenantProfile';
import { t } from '@/lib/translations';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user && data.session) {
        const tenant = await loadTenantFromSession(data.session);
        if (!tenant.ok) {
          await supabase.auth.signOut();
          if (tenant.reason === 'missing_profile') {
            throw new Error(t.profileMissingProfile);
          }
          if (tenant.reason === 'missing_company') {
            throw new Error(t.profileMissingCompany);
          }
          if (tenant.reason === 'profile_fetch') {
            throw new Error(tenant.message || t.profileAccessErrorGeneric);
          }
          if (tenant.reason === 'invalid_role') {
            throw new Error(t.profileInvalidRole);
          }
          throw new Error(t.profileAccessErrorGeneric);
        }
        router.push(tenant.role === 'superadmin' ? '/admin' : '/dashboard');
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || t.failedToLogin);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-md">
        <div>
          <h2 className="text-center text-3xl font-bold text-gray-900">
            {t.employeeShiftPlanner}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {t.signInToAccount}
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                {t.emailAddress}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                {t.password}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your password"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {loading ? t.signingIn : t.signIn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

