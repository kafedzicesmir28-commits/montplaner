'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabaseClient';
import { t } from '@/lib/translations';

type CompanyEmbed = { id: string; name: string | null };

type ProfileRow = {
  id: string;
  created_at: string;
  company_id: string | null;
  role: string;
  companies: CompanyEmbed | CompanyEmbed[] | null;
};

function companyFromProfile(profile: ProfileRow): CompanyEmbed | null {
  const c = profile.companies;
  if (!c) return null;
  return Array.isArray(c) ? c[0] ?? null : c;
}

function readDisplayNameFromUser(user: { user_metadata?: Record<string, unknown> } | null) {
  const meta = user?.user_metadata ?? {};
  const full = meta.full_name;
  const nm = meta.name;
  if (typeof full === 'string') return full;
  if (typeof nm === 'string') return nm;
  return '';
}

function formatDate(iso: string | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', { dateStyle: 'medium' });
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [authCreatedAt, setAuthCreatedAt] = useState<string | undefined>();
  const [profileCreatedAt, setProfileCreatedAt] = useState<string | undefined>();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [companyDbAvailable, setCompanyDbAvailable] = useState(true);

  const [baselineName, setBaselineName] = useState('');
  const [baselineCompany, setBaselineCompany] = useState('');

  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);

  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setSaveError('');
    setSaveSuccess('');
    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!user) throw new Error(t.settingsNotSignedIn);

      setEmail(user.email ?? '');
      setAuthCreatedAt(user.created_at);
      const dn = readDisplayNameFromUser(user);
      setDisplayName(dn);
      setBaselineName(dn.trim());

      let profile: ProfileRow | null = null;
      const { data: prof, error: pErr } = await supabase
        .from('profiles')
        .select('id, created_at, company_id, role, companies ( id, name )')
        .eq('id', user.id)
        .maybeSingle();

      if (pErr) {
        const msg = pErr.message || '';
        if (msg.includes('Could not find the table') || msg.includes('schema cache')) {
          setCompanyDbAvailable(false);
          setCompanyName('');
          setBaselineCompany('');
          setCompanyId(null);
          setProfileId(null);
          setProfileRole(null);
          setProfileCreatedAt(undefined);
        } else {
          throw pErr;
        }
      } else {
        setCompanyDbAvailable(true);
        profile = prof as ProfileRow | null;
        if (profile) {
          setProfileId(profile.id);
          setProfileRole(profile.role);
          setProfileCreatedAt(profile.created_at);
          setCompanyId(profile.company_id);
          const cname = companyFromProfile(profile)?.name?.trim() ?? '';
          setCompanyName(cname);
          setBaselineCompany(cname);
        } else {
          setProfileId(null);
          setProfileRole(null);
          setProfileCreatedAt(undefined);
          setCompanyId(null);
          setCompanyName('');
          setBaselineCompany('');
        }
      }
    } catch (e: unknown) {
      console.error(e);
      setSaveError(e instanceof Error ? e.message : t.errorLoadingData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasProfileChanges = useMemo(() => {
    return displayName.trim() !== baselineName || companyName.trim() !== baselineCompany;
  }, [displayName, companyName, baselineName, baselineCompany]);

  useEffect(() => {
    if (hasProfileChanges) setSaveSuccess('');
  }, [hasProfileChanges]);

  const saveDisabled =
    saving ||
    loading ||
    !hasProfileChanges ||
    !displayName.trim() ||
    (companyDbAvailable && !companyName.trim());

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    setSaveSuccess('');
    const nameTrim = displayName.trim();
    const companyTrim = companyName.trim();
    if (!nameTrim) {
      setSaveError(t.settingsNameRequired);
      return;
    }
    if (companyDbAvailable && !companyTrim) {
      setSaveError(t.settingsCompanyRequired);
      return;
    }
    setSaving(true);
    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!user) throw new Error(t.settingsNotSignedIn);

      const { error: metaErr } = await supabase.auth.updateUser({
        data: { full_name: nameTrim },
      });
      if (metaErr) throw metaErr;

      if (companyDbAvailable) {
        if (companyId) {
          const { error: upErr } = await supabase
            .from('companies')
            .update({ name: companyTrim })
            .eq('id', companyId);
          if (upErr) throw upErr;
        } else if (profileId && !companyId && profileRole === 'superadmin') {
          const { data: comp, error: insCErr } = await supabase
            .from('companies')
            .insert({ name: companyTrim })
            .select('id')
            .single();
          if (insCErr) throw insCErr;
          const { error: upPErr } = await supabase
            .from('profiles')
            .update({ company_id: comp.id, email: user.email ?? null })
            .eq('id', user.id);
          if (upPErr) throw upPErr;
          setCompanyId(comp.id);
        } else if (!profileId) {
          const { data: comp, error: insCErr } = await supabase
            .from('companies')
            .insert({ name: companyTrim })
            .select('id')
            .single();
          if (insCErr) throw insCErr;
          const { error: insPErr } = await supabase.from('profiles').insert({
            id: user.id,
            company_id: comp.id,
            role: 'admin',
            email: user.email ?? null,
          });
          if (insPErr) throw insPErr;
          setProfileId(user.id);
          setProfileRole('admin');
          setCompanyId(comp.id);
          setProfileCreatedAt(new Date().toISOString());
        } else {
          const { data: comp, error: insCErr } = await supabase
            .from('companies')
            .insert({ name: companyTrim })
            .select('id')
            .single();
          if (insCErr) throw insCErr;
          const { error: upPErr } = await supabase
            .from('profiles')
            .update({ company_id: comp.id, email: user.email ?? null })
            .eq('id', user.id);
          if (upPErr) throw upPErr;
          setCompanyId(comp.id);
        }
      }

      setBaselineName(nameTrim);
      if (companyDbAvailable) setBaselineCompany(companyTrim);
      setSaveSuccess(t.settingsSaved);
      await supabase.auth.refreshSession();
    } catch (e: unknown) {
      console.error(e);
      setSaveError(e instanceof Error ? e.message : t.errorSaving);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (newPassword.length < 6) {
      setPasswordError(t.settingsPasswordTooShort);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t.settingsPasswordMismatch);
      return;
    }
    setPasswordBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(t.settingsPasswordUpdated);
    } catch (e: unknown) {
      setPasswordError(e instanceof Error ? e.message : t.error);
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleResetEmail = async () => {
    setResetMessage('');
    if (!email) {
      setResetMessage(t.settingsNoEmail);
      return;
    }
    setResetBusy(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/login`,
      });
      if (error) throw error;
      setResetMessage(t.settingsResetEmailSent);
    } catch (e: unknown) {
      setResetMessage(e instanceof Error ? e.message : t.error);
    } finally {
      setResetBusy(false);
    }
  };

  const createdLabel = profileCreatedAt ? formatDate(profileCreatedAt) : formatDate(authCreatedAt);

  return (
    <AuthGuard>
      <Layout>
        <div className="mx-auto max-w-xl space-y-8">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{t.settingsTitle}</h1>
            <p className="mt-1 text-sm text-gray-600">{t.settingsSubtitle}</p>
          </div>

          {loading ? (
            <p className="text-sm text-gray-600">{t.loading}</p>
          ) : (
            <div className="space-y-8">
              <form onSubmit={handleSaveProfile} className="space-y-10">
                <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                    {t.settingsSectionProfile}
                  </h2>
                  <div className="mt-4 space-y-4">
                    <div>
                      <label htmlFor="settings-name" className="mb-1 block text-sm font-medium text-gray-700">
                        {t.settingsDisplayName}
                      </label>
                      <input
                        id="settings-name"
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoComplete="name"
                      />
                    </div>
                    <div>
                      <span className="mb-1 block text-sm font-medium text-gray-700">{t.emailAddress}</span>
                      <input
                        type="email"
                        value={email}
                        readOnly
                        className="w-full cursor-not-allowed rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
                      />
                    </div>
                    {createdLabel ? (
                      <div>
                        <span className="mb-1 block text-sm font-medium text-gray-700">{t.settingsMemberSince}</span>
                        <p className="text-sm text-gray-600">{createdLabel}</p>
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                    {t.settingsSectionCompany}
                  </h2>
                  {!companyDbAvailable ? (
                    <p className="mt-4 text-sm text-amber-800" role="status">
                      {t.settingsCompanyUnavailable}
                    </p>
                  ) : (
                    <div className="mt-4">
                      <label htmlFor="settings-company" className="mb-1 block text-sm font-medium text-gray-700">
                        {t.settingsCompanyName}
                      </label>
                      <input
                        id="settings-company"
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoComplete="organization"
                      />
                    </div>
                  )}
                </section>

                {saveError ? (
                  <p className="text-sm text-red-600" role="alert">
                    {saveError}
                  </p>
                ) : null}
                {saveSuccess ? (
                  <p className="text-sm text-green-700" role="status">
                    {saveSuccess}
                  </p>
                ) : null}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saveDisabled}
                    className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                  >
                    {saving ? t.settingsSaving : t.save}
                  </button>
                </div>
              </form>

              <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  {t.settingsSectionSecurity}
                </h2>
                <form onSubmit={handleUpdatePassword} className="mt-4 space-y-4">
                  <div>
                    <label htmlFor="settings-new-pw" className="mb-1 block text-sm font-medium text-gray-700">
                      {t.settingsNewPassword}
                    </label>
                    <input
                      id="settings-new-pw"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label htmlFor="settings-confirm-pw" className="mb-1 block text-sm font-medium text-gray-700">
                      {t.settingsConfirmPassword}
                    </label>
                    <input
                      id="settings-confirm-pw"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      autoComplete="new-password"
                    />
                  </div>
                  {passwordError ? (
                    <p className="text-sm text-red-600" role="alert">
                      {passwordError}
                    </p>
                  ) : null}
                  {passwordSuccess ? (
                    <p className="text-sm text-green-700" role="status">
                      {passwordSuccess}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={passwordBusy || !newPassword || !confirmPassword}
                      className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {passwordBusy ? t.settingsUpdatingPassword : t.settingsChangePassword}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleResetEmail()}
                      disabled={resetBusy || !email}
                      className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
                    >
                      {resetBusy ? t.settingsSending : t.settingsSendResetLink}
                    </button>
                  </div>
                  {resetMessage ? (
                    <p
                      className={`text-sm ${resetMessage === t.settingsResetEmailSent ? 'text-green-700' : 'text-gray-700'}`}
                      role="status"
                    >
                      {resetMessage}
                    </p>
                  ) : null}
                </form>
              </section>
            </div>
          )}
        </div>
      </Layout>
    </AuthGuard>
  );
}
