'use client';

import { useCallback, useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/lib/supabaseClient';
import { adminPostJson } from '@/lib/adminApi';
import { formatErrorMessage } from '@/lib/utils';
import { adminEn } from './adminEn';

type CompanyRow = { id: string; name: string | null; created_at: string };

type ProfileRow = {
  id: string;
  email: string | null;
  role: string;
  company_id: string | null;
  created_at: string;
  company: Pick<CompanyRow, 'id' | 'name'> | null;
};

export default function AdminPage() {
  return (
    <AuthGuard>
      <AdminPageInner />
    </AuthGuard>
  );
}

function AdminPageInner() {
  const { role } = useCompany();
  if (role !== 'superadmin') {
    return (
      <Layout>
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-lg text-gray-800">{adminEn.forbidden}</p>
        </div>
      </Layout>
    );
  }
  return <AdminPanel />;
}

function AdminPanel() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newCompanyName, setNewCompanyName] = useState('');
  const [savingCompany, setSavingCompany] = useState(false);

  const [nuEmail, setNuEmail] = useState('');
  const [nuPassword, setNuPassword] = useState('');
  const [nuCompanyId, setNuCompanyId] = useState('');
  const [nuRole, setNuRole] = useState<'user' | 'admin' | 'superadmin'>('user');
  const [savingUser, setSavingUser] = useState(false);

  const [assignUserId, setAssignUserId] = useState('');
  const [assignCompanyId, setAssignCompanyId] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [cRes, pRes] = await Promise.all([
        supabase.from('companies').select('id, name, created_at').order('created_at', { ascending: false }),
        // Use * so missing optional columns (e.g. email before migration-profiles-email.sql) do not cause 400.
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      ]);
      if (cRes.error) throw cRes.error;
      if (pRes.error) throw pRes.error;
      const companyRows = (cRes.data || []) as CompanyRow[];
      const companyById = new Map(companyRows.map((c) => [c.id, c]));
      const profileRows = (pRes.data || []).map((row) => {
        const r = row as Record<string, unknown>;
        const p: Omit<ProfileRow, 'company'> = {
          id: String(r.id ?? ''),
          email: typeof r.email === 'string' ? r.email : null,
          role: String(r.role ?? ''),
          company_id: (typeof r.company_id === 'string' ? r.company_id : null) as string | null,
          created_at: typeof r.created_at === 'string' ? r.created_at : String(r.created_at ?? ''),
        };
        const c = p.company_id ? companyById.get(p.company_id) : undefined;
        return {
          ...p,
          company: c ? { id: c.id, name: c.name } : null,
        } satisfies ProfileRow;
      });
      setCompanies(companyRows);
      setProfiles(profileRows);
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCompanyName.trim();
    if (!name) return;
    setSavingCompany(true);
    setError(null);
    try {
      const { error: insErr } = await supabase.from('companies').insert({ name });
      if (insErr) throw insErr;
      setNewCompanyName('');
      await load();
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
    } finally {
      setSavingCompany(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuCompanyId) {
      setError(adminEn.selectCompany);
      return;
    }
    setSavingUser(true);
    setError(null);
    try {
      await adminPostJson<{ ok: boolean }>('/api/admin/users', {
        email: nuEmail.trim(),
        password: nuPassword,
        company_id: nuCompanyId,
        role: nuRole,
      });
      setNuEmail('');
      setNuPassword('');
      setNuRole('user');
      await load();
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
    } finally {
      setSavingUser(false);
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignUserId || !assignCompanyId) {
      setError(adminEn.assignMissing);
      return;
    }
    setAssignSaving(true);
    setError(null);
    try {
      const { error: upErr } = await supabase
        .from('profiles')
        .update({ company_id: assignCompanyId })
        .eq('id', assignUserId);
      if (upErr) throw upErr;
      setAssignUserId('');
      setAssignCompanyId('');
      await load();
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
    } finally {
      setAssignSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center text-gray-600">{adminEn.loading}</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-10" lang="en">
        <h1 className="text-3xl font-bold text-gray-900">{adminEn.title}</h1>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">{adminEn.companies}</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">{adminEn.companyName}</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">{adminEn.createdAt}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2 text-gray-900">{c.name || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {c.created_at
                        ? new Date(c.created_at).toLocaleString('en-US', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form onSubmit={handleCreateCompany} className="mt-6 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{adminEn.newCompany}</label>
              <input
                type="text"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-gray-900"
                placeholder={adminEn.companyName}
              />
            </div>
            <button
              type="submit"
              disabled={savingCompany || !newCompanyName.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {savingCompany ? adminEn.loading : adminEn.createCompany}
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">{adminEn.users}</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">{adminEn.userEmail}</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">{adminEn.userCompany}</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">{adminEn.userRole}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {profiles.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-gray-900">{p.email || p.id}</td>
                    <td className="px-3 py-2 text-gray-600">{p.company?.name || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{p.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form onSubmit={handleCreateUser} className="mt-6 grid gap-4 border-t border-gray-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-600">{adminEn.email}</label>
              <input
                type="email"
                required
                value={nuEmail}
                onChange={(e) => setNuEmail(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{adminEn.password}</label>
              <input
                type="password"
                required
                minLength={6}
                value={nuPassword}
                onChange={(e) => setNuPassword(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
                placeholder={adminEn.passwordHint}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{adminEn.userCompany}</label>
              <select
                required
                value={nuCompanyId}
                onChange={(e) => setNuCompanyId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
              >
                <option value="">{adminEn.companyPlaceholder}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{adminEn.userRole}</label>
              <select
                value={nuRole}
                onChange={(e) => setNuRole(e.target.value as 'user' | 'admin' | 'superadmin')}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
              >
                <option value="user">{adminEn.roleUser}</option>
                <option value="admin">{adminEn.roleAdmin}</option>
                <option value="superadmin">{adminEn.roleSuperadmin}</option>
              </select>
            </div>
            <div className="flex items-end sm:col-span-2 lg:col-span-4">
              <button
                type="submit"
                disabled={savingUser}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {savingUser ? adminEn.loading : adminEn.newUser}
              </button>
            </div>
          </form>

          <form onSubmit={handleAssign} className="mt-8 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{adminEn.assignUser}</label>
              <select
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-gray-900"
              >
                <option value="">{adminEn.userPlaceholder}</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.email || p.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">{adminEn.assignCompany}</label>
              <select
                value={assignCompanyId}
                onChange={(e) => setAssignCompanyId(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-gray-900"
              >
                <option value="">{adminEn.companyPlaceholder}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.id}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={assignSaving}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
            >
              {assignSaving ? adminEn.loading : adminEn.assignSubmit}
            </button>
          </form>
        </section>
      </div>
    </Layout>
  );
}
