'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const passwordValid = useMemo(() => newPassword.length >= 6, [newPassword]);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      // When coming from Supabase recovery mail, tokens arrive in URL hash.
      // supabase-js consumes this hash and establishes a temporary recovery session.
      await supabase.auth.getSession();
      if (active) setReady(true);
    };

    void bootstrap();

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!passwordValid) {
      setError('Sifra mora imati najmanje 6 karaktera.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Sifre se ne poklapaju.');
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      setSuccess('Sifra je uspjesno promijenjena. Preusmjeravam na login...');
      setTimeout(() => {
        router.replace('/login');
      }, 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Neuspjesna promjena sifre.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Reset sifre</h1>
        <p className="mt-1 text-sm text-gray-600">
          Unesi novu sifru za svoj nalog.
        </p>

        {!ready ? (
          <p className="mt-6 text-sm text-gray-600">Ucitavanje recovery sesije...</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-gray-700">
                Nova sifra
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                autoComplete="new-password"
                required
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-gray-700">
                Potvrdi sifru
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                autoComplete="new-password"
                required
              />
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {success ? <p className="text-sm text-green-700">{success}</p> : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? 'Spremam...' : 'Postavi novu sifru'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
