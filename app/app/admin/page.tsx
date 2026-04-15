'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { getCurrentAccessToken, getCurrentAuthProfile } from '@/lib/authProfile';

type AdminOverviewResponse = {
  companies: Array<{ id: string; name: string; created_at: string; employees_count: number }>;
  users: Array<{
    id: string;
    email: string | null;
    role: 'superadmin' | 'user';
    company_id: string | null;
    company_name: string | null;
    last_login: string | null;
  }>;
  stats: {
    total_companies: number;
    total_users: number;
    employees_per_company: Array<{ company_id: string; company_name: string; employees: number }>;
  };
  login_logs: Array<{
    id: string;
    user_id: string | null;
    email: string | null;
    login_time: string;
    ip: string | null;
  }>;
};

function formatDateTime(input: string | null) {
  if (!input) return '-';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('de-DE');
}

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const [newCompanyName, setNewCompanyName] = useState('');
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserCompanyId, setNewUserCompanyId] = useState('');
  const [newUserRole, setNewUserRole] = useState<'superadmin' | 'user'>('user');
  const [creatingUser, setCreatingUser] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [settingPasswordFor, setSettingPasswordFor] = useState<string | null>(null);

  const companyOptions = useMemo(() => overview?.companies ?? [], [overview]);

  const loadOverview = useCallback(
    async (accessToken: string) => {
      const res = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const text = await res.text();
      let data: unknown = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (!res.ok) {
        const apiError =
          typeof data === 'object' && data !== null && 'error' in data
            ? String((data as { error?: string }).error ?? '')
            : '';
        throw new Error(apiError || text || 'Failed to load admin overview');
      }
      setOverview((data ?? {}) as AdminOverviewResponse);
    },
    []
  );

  useEffect(() => {
    const boot = async () => {
      setLoading(true);
      setError('');
      try {
        const [profile, accessToken] = await Promise.all([
          getCurrentAuthProfile(),
          getCurrentAccessToken(),
        ]);
        if (!profile || profile.role !== 'superadmin') {
          router.replace('/dashboard');
          return;
        }
        if (!accessToken) throw new Error('No access token available');
        setToken(accessToken);
        await loadOverview(accessToken);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load admin page');
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, [loadOverview, router]);

  const createCompany = async () => {
    if (!token || !newCompanyName.trim()) return;
    setCreatingCompany(true);
    setActionMessage('');
    try {
      const res = await fetch('/api/admin/companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newCompanyName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to create company');
      setNewUserCompanyId(data?.company?.id ?? '');
      setNewCompanyName('');
      setActionMessage('Company created. You can now add the first user for this company.');
      await loadOverview(token);
    } catch (e: unknown) {
      setActionMessage(e instanceof Error ? e.message : 'Failed to create company');
    } finally {
      setCreatingCompany(false);
    }
  };

  const createUser = async () => {
    if (!token) return;
    setCreatingUser(true);
    setActionMessage('');
    try {
      const payload = {
        email: newUserEmail.trim(),
        password: newUserPassword,
        company_id: newUserRole === 'superadmin' ? null : newUserCompanyId || null,
        role: newUserRole,
      };
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to create user');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserCompanyId('');
      setNewUserRole('user');
      setActionMessage('User created.');
      await loadOverview(token);
    } catch (e: unknown) {
      setActionMessage(e instanceof Error ? e.message : 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  };

  const setTemporaryPassword = async (userId: string, email: string | null) => {
    if (!token) return;
    const tempPassword = window.prompt(`Privremena sifra za ${email ?? userId}:`, '');
    if (!tempPassword) return;
    setSettingPasswordFor(userId);
    setActionMessage('');
    try {
      const res = await fetch('/api/admin/users/password', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: userId, password: tempPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to set temporary password');
      setActionMessage(`Temporary password updated for ${email ?? userId}.`);
    } catch (e: unknown) {
      setActionMessage(e instanceof Error ? e.message : 'Failed to set temporary password');
    } finally {
      setSettingPasswordFor(null);
    }
  };

  const exportAllData = async () => {
    if (!token) return;
    setExporting(true);
    setActionMessage('');
    try {
      const res = await fetch('/api/admin/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error ?? 'Failed to export data');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') ?? '';
      const match = disposition.match(/filename="(.+)"/i);
      const filename = match?.[1] ?? `backup-${Date.now()}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setActionMessage('Export complete.');
    } catch (e: unknown) {
      setActionMessage(e instanceof Error ? e.message : 'Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  const importAllData = async (file: File) => {
    if (!token) return;
    setImporting(true);
    setActionMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to import data');
      setActionMessage('Import complete.');
      await loadOverview(token);
    } catch (e: unknown) {
      setActionMessage(e instanceof Error ? e.message : 'Failed to import data');
    } finally {
      setImporting(false);
    }
  };

  return (
    <AuthGuard>
      <Layout>
        <div className="mx-auto max-w-7xl space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Superadmin Panel</h1>
            <p className="mt-1 text-sm text-gray-600">Monitor all companies, users, and system-wide activity.</p>
          </div>

          {loading ? <p className="text-sm text-gray-600">Loading admin data...</p> : null}
          {!loading && error ? <p className="text-sm text-red-600">{error}</p> : null}

          {!loading && !error && overview ? (
            <>
              <section className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-sm text-gray-500">Total companies</p>
                  <p className="mt-2 text-2xl font-semibold">{overview.stats.total_companies}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-sm text-gray-500">Total users</p>
                  <p className="mt-2 text-2xl font-semibold">{overview.stats.total_users}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-sm text-gray-500">Latest login</p>
                  <p className="mt-2 text-sm font-medium">
                    {formatDateTime(overview.login_logs[0]?.login_time ?? null)}
                  </p>
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">Global export/import</h2>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void exportAllData()}
                    disabled={exporting}
                    className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {exporting ? 'Exporting...' : 'Export All Data'}
                  </button>
                  <label className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-800 hover:bg-gray-50">
                    {importing ? 'Importing...' : 'Import Data'}
                    <input
                      type="file"
                      accept=".zip"
                      className="hidden"
                      disabled={importing}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          void importAllData(file);
                        }
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                </div>
                {actionMessage ? <p className="mt-3 text-sm text-gray-700">{actionMessage}</p> : null}
              </section>

              <section className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-900">Create company</h2>
                  <div className="mt-4 flex gap-2">
                    <input
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                      placeholder="Company name"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void createCompany()}
                      disabled={creatingCompany || !newCompanyName.trim()}
                      className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                      Create
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-900">Create user</h2>
                  <div className="mt-4 space-y-2">
                    <input
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="user@company.com"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                    <input
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      type="password"
                      placeholder="Temporary password"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <select
                        value={newUserRole}
                        onChange={(e) => setNewUserRole(e.target.value as 'superadmin' | 'user')}
                        className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="user">user</option>
                        <option value="superadmin">superadmin</option>
                      </select>
                      <select
                        value={newUserCompanyId}
                        onChange={(e) => setNewUserCompanyId(e.target.value)}
                        disabled={newUserRole === 'superadmin'}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                      >
                        <option value="">Select company</option>
                        {companyOptions.map((company) => (
                          <option key={company.id} value={company.id}>
                            {company.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => void createUser()}
                      disabled={
                        creatingUser ||
                        !newUserEmail.trim() ||
                        !newUserPassword ||
                        (newUserRole !== 'superadmin' && !newUserCompanyId)
                      }
                      className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                      {creatingUser ? 'Creating...' : 'Create User'}
                    </button>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">Companies</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="px-2 py-2">Name</th>
                        <th className="px-2 py-2">Employees</th>
                        <th className="px-2 py-2">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.companies.map((company) => (
                        <tr key={company.id} className="border-t border-gray-100">
                          <td className="px-2 py-2">{company.name}</td>
                          <td className="px-2 py-2">{company.employees_count}</td>
                          <td className="px-2 py-2">{formatDateTime(company.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-lg font-semibold text-gray-900">Owners and users</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="px-2 py-2">Email</th>
                        <th className="px-2 py-2">Company</th>
                        <th className="px-2 py-2">Role</th>
                        <th className="px-2 py-2">Last login</th>
                        <th className="px-2 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.users.map((user) => (
                        <tr key={user.id} className="border-t border-gray-100">
                          <td className="px-2 py-2">{user.email ?? '-'}</td>
                          <td className="px-2 py-2">{user.company_name ?? '-'}</td>
                          <td className="px-2 py-2">{user.role}</td>
                          <td className="px-2 py-2">{formatDateTime(user.last_login)}</td>
                          <td className="px-2 py-2">
                            {user.role === 'user' ? (
                              <button
                                type="button"
                                onClick={() => void setTemporaryPassword(user.id, user.email)}
                                disabled={settingPasswordFor === user.id}
                                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                              >
                                {settingPasswordFor === user.id ? 'Saving...' : 'Set temporary password'}
                              </button>
                            ) : (
                              <span className="text-xs text-gray-500">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">Owner login logs</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="px-2 py-2">Email</th>
                        <th className="px-2 py-2">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.login_logs.map((log) => (
                        <tr key={log.id} className="border-t border-gray-100">
                          <td className="px-2 py-2">{log.email ?? '-'}</td>
                          <td className="px-2 py-2">{formatDateTime(log.login_time)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </Layout>
    </AuthGuard>
  );
}
