'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { t } from '@/lib/translations';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
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

      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();
        const nextRoute = (profile?.role ?? 'user') === 'superadmin' ? '/admin' : '/dashboard';
        router.push(nextRoute);
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || t.failedToLogin);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    setResetMessage('');

    if (!email.trim()) {
      setError('Unesi email da posaljes reset link.');
      return;
    }

    setResetLoading(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin}/auth/reset-password`,
      });
      if (error) throw error;
      setResetMessage('Reset link je poslan na tvoj email.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Neuspjesno slanje reset linka.');
    } finally {
      setResetLoading(false);
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
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={() => void handleForgotPassword()}
                  disabled={resetLoading}
                  className="text-sm text-blue-700 hover:underline disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  {resetLoading ? 'Saljem...' : 'Zab ste pass?'}
                </button>
              </div>
            </div>
          </div>

          {resetMessage ? (
            <p className="text-sm text-green-700" role="status">
              {resetMessage}
            </p>
          ) : null}

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

