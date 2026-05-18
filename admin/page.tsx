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
    audit_events_24h: number;
    events_by_action_24h: Array<{ action: string; count: number }>;
    employees_per_company: Array<{ company_id: string; company_name: string; employees: number }>;
  };
  login_logs: Array<{
    id: string;
    user_id: string | null;
    email: string | null;
    login_time: string;
    ip: string | null;
  }>;
  audit_logs: Array<{
    id: string;
    action: string;
    actor_email: string | null;
    target_type: string | null;
    target_email: string | null;
    created_at: string;
    ip: string | null;
  }>;
};
type AdminTicket = {
  id: string;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  created_at: string;
  expires_at: string;
  is_overdue?: boolean;
};
type AdminTicketMessage = {
  id: string;
  author_role_snapshot: string;
  message: string;
  created_at: string;
};

function formatDateTime(input: string | null) {
  if (!input) return '-';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('de-DE');
}

function ticketStatusBadgeClass(status: AdminTicket['status'], isOverdue?: boolean) {
  if (isOverdue) return 'bg-red-100 text-red-700 ring-red-200';
  if (status === 'open') return 'bg-blue-100 text-blue-700 ring-blue-200';
  if (status === 'in_progress') return 'bg-amber-100 text-amber-700 ring-amber-200';
  if (status === 'resolved') return 'bg-emerald-100 text-emerald-700 ring-emerald-200';
  return 'bg-slate-100 text-slate-700 ring-slate-200';
}

function ticketPriorityBadgeClass(priority: AdminTicket['priority']) {
  if (priority === 'urgent') return 'bg-red-600 text-white';
  if (priority === 'high') return 'bg-orange-500 text-white';
  if (priority === 'normal') return 'bg-blue-600 text-white';
  return 'bg-slate-500 text-white';
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
  const [skipDuplicatesOnImport, setSkipDuplicatesOnImport] = useState(true);
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketMessages, setTicketMessages] = useState<AdminTicketMessage[]>([]);
  const [ticketReply, setTicketReply] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved' | 'closed' | 'overdue'>('all');
  const [ticketActionLoading, setTicketActionLoading] = useState(false);
  const [renamingCompanyId, setRenamingCompanyId] = useState<string | null>(null);
  const [deletingCompanyId, setDeletingCompanyId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

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

  const loadTickets = useCallback(
    async (accessToken: string) => {
      const url =
        ticketStatusFilter === 'all'
          ? '/api/admin/tickets'
          : ticketStatusFilter === 'overdue'
            ? '/api/admin/tickets'
            : `/api/admin/tickets?status=${ticketStatusFilter}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load tickets');
      const list = (data?.tickets ?? []) as AdminTicket[];
      setTickets(
        ticketStatusFilter === 'overdue'
          ? list.filter((t) => t.is_overdue)
          : list
      );
    },
    [ticketStatusFilter]
  );

  const loadTicketDetails = useCallback(async (accessToken: string, ticketId: string) => {
    const res = await fetch(`/api/support/tickets/${ticketId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? 'Failed to load ticket');
    setTicketMessages((data?.messages ?? []) as AdminTicketMessage[]);
  }, []);

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
        await loadTickets(accessToken);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load admin page');
      } finally {
        setLoading(false);
      }
    };
    void boot();
  }, [loadOverview, loadTickets, router]);

  useEffect(() => {
    if (!token) return;
    void loadTickets(token);
  }, [token, loadTickets]);

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
      formData.append('skipDuplicates', skipDuplicatesOnImport ? 'true' : 'false');
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to import data');
      const skipped = Number(data?.skipped_duplicates ?? 0);
      const imported = Array.isArray(data?.imported)
        ? data.imported.reduce((sum: number, row: { rows?: number }) => sum + Number(row.rows ?? 0), 0)
        : 0;
      if (skipDuplicatesOnImport) {
        setActionMessage(`Import complete. Imported ${imported} rows, skipped ${skipped} duplicates.`);
      } else {
        setActionMessage('Import complete.');
      }
      await loadOverview(token);
    } catch (e: unknown) {
      setActionMessage(e instanceof Error ? e.message : 'Failed to import data');
    } finally {
      setImporting(false);
    }
  };

  const openTicketDetails = async (ticketId: string) => {
    if (!token) return;
    setSelectedTicketId(ticketId);
    await loadTicketDetails(token, ticketId);
  };

  const changeTicketStatus = async (status: 'open' | 'in_progress' | 'resolved' | 'closed') => {
    if (!token || !selectedTicketId) return;
    setTicketActionLoading(true);
    try {
      const res = await fetch(`/api/admin/tickets/${selectedTicketId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to update ticket status');
      await loadTickets(token);
      await loadTicketDetails(token, selectedTicketId);
    } finally {
      setTicketActionLoading(false);
    }
  };

  const sendTicketReply = async () => {
    if (!token || !selectedTicketId || !ticketReply.trim()) return;
    setTicketActionLoading(true);
    try {
      const res = await fetch(`/api/support/tickets/${selectedTicketId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: ticketReply.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to send reply');
      setTicketReply('');
      await loadTickets(token);
      await loadTicketDetails(token, selectedTicketId);
    } finally {
      setTicketActionLoading(false);
    }
  };

  const renameCompany = async (companyId: string, currentName: string) => {
    if (!token) return;
    const nextName = window.prompt('Neuer Firmenname:', currentName)?.trim();
    if (!nextName || nextName === currentName) return;
    setRenamingCompanyId(companyId);
    setActionMessage('');
    try {
      const res = await fetch('/api/admin/companies', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: companyId, name: nextName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to rename company');
      setActionMessage(`Company renamed to "${nextName}".`);
      await loadOverview(token);
    } catch (e: unknown) {
      setActionMessage(e instanceof Error ? e.message : 'Failed to rename company');
    } finally {
      setRenamingCompanyId(null);
    }
  };

  const deleteCompany = async (companyId: string, companyName: string) => {
    if (!token) return;
    const typed = window.prompt(
      `Sicherheitsabfrage: Tippe den exakten Firmennamen zum Loschen ein:\n\n${companyName}`,
      ''
    );
    if (!typed) return;
    if (typed.trim() !== companyName) {
      setActionMessage('Loschen abgebrochen: Firmenname stimmt nicht exakt uberein.');
      return;
    }
    setDeletingCompanyId(companyId);
    setActionMessage('');
    try {
      const res = await fetch('/api/admin/companies', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: companyId, confirm_text: typed.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to delete company');
      setActionMessage(`Company "${companyName}" deleted.`);
      if (selectedTicketId) {
        setSelectedTicketId(null);
        setTicketMessages([]);
      }
      await loadOverview(token);
      await loadTickets(token);
    } catch (e: unknown) {
      setActionMessage(e instanceof Error ? e.message : 'Failed to delete company');
    } finally {
      setDeletingCompanyId(null);
    }
  };

  const deleteUser = async (id: string, email: string | null) => {
    if (!token) return;
    const confirmationLabel = (email ?? id).trim();
    const typed = window.prompt(
      `Sicherheitsabfrage: Tippe die exakte E-Mail zum Loschen ein:\n\n${confirmationLabel}`,
      ''
    );
    if (!typed) return;
    if (typed.trim() !== confirmationLabel) {
      setActionMessage('Loschen abgebrochen: E-Mail stimmt nicht exakt uberein.');
      return;
    }
    setDeletingUserId(id);
    setActionMessage('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, confirm_text: typed.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to delete user');
      setActionMessage(`User "${confirmationLabel}" deleted.`);
      await loadOverview(token);
    } catch (e: unknown) {
      setActionMessage(e instanceof Error ? e.message : 'Failed to delete user');
    } finally {
      setDeletingUserId(null);
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
              <section className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-sm text-gray-500">Audit events (24h)</p>
                  <p className="mt-2 text-2xl font-semibold">{overview.stats.audit_events_24h}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:col-span-2">
                  <p className="text-sm text-gray-500">Top events (24h)</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(overview.stats.events_by_action_24h ?? []).slice(0, 6).map((row) => (
                      <span
                        key={row.action}
                        className="rounded-full border border-gray-300 bg-gray-50 px-2.5 py-1 text-xs text-gray-700"
                      >
                        {row.action}: {row.count}
                      </span>
                    ))}
                    {(overview.stats.events_by_action_24h ?? []).length === 0 ? (
                      <span className="text-sm text-gray-500">No audit events in last 24h.</span>
                    ) : null}
                  </div>
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
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={skipDuplicatesOnImport}
                      onChange={(e) => setSkipDuplicatesOnImport(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Skip duplicates
                  </label>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Import expects the exported backup ZIP. New exports use a JSON backup format for safer type-preserving restore.
                  If <span className="font-semibold">Skip duplicates</span> is enabled, duplicate planner entries for the same employee/day
                  are skipped.
                </p>
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
                        <th className="px-2 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.companies.map((company) => (
                        <tr key={company.id} className="border-t border-gray-100">
                          <td className="px-2 py-2">{company.name}</td>
                          <td className="px-2 py-2">{company.employees_count}</td>
                          <td className="px-2 py-2">{formatDateTime(company.created_at)}</td>
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => void renameCompany(company.id, company.name)}
                              disabled={renamingCompanyId === company.id || deletingCompanyId === company.id}
                              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                            >
                              {renamingCompanyId === company.id ? 'Saving...' : 'Rename'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteCompany(company.id, company.name)}
                              disabled={deletingCompanyId === company.id || renamingCompanyId === company.id}
                              className="ml-2 rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-60"
                            >
                              {deletingCompanyId === company.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </td>
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
                            <button
                              type="button"
                              onClick={() => void deleteUser(user.id, user.email)}
                              disabled={deletingUserId === user.id}
                              className="rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-60"
                            >
                              {deletingUserId === user.id ? 'Deleting...' : 'Delete user'}
                            </button>
                            {user.role === 'user' ? (
                              <button
                                type="button"
                                onClick={() => void setTemporaryPassword(user.id, user.email)}
                                disabled={settingPasswordFor === user.id}
                                className="ml-2 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                              >
                                {settingPasswordFor === user.id ? 'Saving...' : 'Set temporary password'}
                              </button>
                            ) : (
                              <span className="ml-2 text-xs text-gray-500">-</span>
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

              <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">Recent audit events</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="px-2 py-2">Action</th>
                        <th className="px-2 py-2">Actor</th>
                        <th className="px-2 py-2">Target</th>
                        <th className="px-2 py-2">IP</th>
                        <th className="px-2 py-2">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.audit_logs.map((event) => (
                        <tr key={event.id} className="border-t border-gray-100">
                          <td className="px-2 py-2">{event.action}</td>
                          <td className="px-2 py-2">{event.actor_email ?? '-'}</td>
                          <td className="px-2 py-2">
                            {event.target_type ? `${event.target_type}: ` : ''}
                            {event.target_email ?? '-'}
                          </td>
                          <td className="px-2 py-2">{event.ip ?? '-'}</td>
                          <td className="px-2 py-2">{formatDateTime(event.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-700 px-4 py-3 text-white">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold">Support Tickets</h2>
                      <p className="text-xs text-slate-200">Antworten, priorisieren, lösen oder schließen.</p>
                    </div>
                    <select
                      value={ticketStatusFilter}
                      onChange={(e) =>
                        setTicketStatusFilter(
                          e.target.value as 'all' | 'open' | 'in_progress' | 'resolved' | 'closed' | 'overdue'
                        )
                      }
                      className="rounded-md border border-slate-400 bg-white/95 px-2 py-1 text-sm text-slate-800"
                    >
                      <option value="all">all</option>
                      <option value="open">open</option>
                      <option value="in_progress">in_progress</option>
                      <option value="overdue">overdue</option>
                      <option value="resolved">resolved</option>
                      <option value="closed">closed</option>
                    </select>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    {tickets.map((ticket) => (
                      <button
                        key={ticket.id}
                        type="button"
                        onClick={() => void openTicketDetails(ticket.id)}
                        className={`w-full rounded-lg border px-3 py-2 text-left shadow-sm transition hover:-translate-y-0.5 ${
                          selectedTicketId === ticket.id
                            ? 'border-blue-300 bg-blue-50'
                            : 'border-gray-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-2 text-sm font-medium text-gray-900">{ticket.subject}</p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ticketPriorityBadgeClass(ticket.priority)}`}
                          >
                            {ticket.priority}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${ticketStatusBadgeClass(
                              ticket.status,
                              ticket.is_overdue
                            )}`}
                          >
                            {ticket.is_overdue ? 'overdue' : ticket.status}
                          </span>
                          <span className="text-[11px] text-gray-500">{formatDateTime(ticket.created_at)}</span>
                        </div>
                      </button>
                    ))}
                    {tickets.length === 0 ? <p className="text-sm text-gray-500">No tickets for current filter.</p> : null}
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                    {!selectedTicketId ? (
                      <p className="text-sm text-gray-500">Select ticket to reply or change status.</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                          {ticketMessages.map((msg) => (
                            <div key={msg.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm">
                              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{msg.author_role_snapshot}</p>
                              <p>{msg.message}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(['open', 'in_progress', 'resolved', 'closed'] as const).map((status) => (
                            <button
                              key={status}
                              type="button"
                              disabled={ticketActionLoading}
                              onClick={() => void changeTicketStatus(status)}
                              className={`rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-60 ${
                                status === 'open'
                                  ? 'border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                                  : status === 'in_progress'
                                    ? 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                    : status === 'resolved'
                                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                      : 'border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                        <textarea
                          rows={3}
                          value={ticketReply}
                          onChange={(e) => setTicketReply(e.target.value)}
                          placeholder="Reply to ticket..."
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        />
                        <button
                          type="button"
                          onClick={() => void sendTicketReply()}
                          disabled={ticketActionLoading || !ticketReply.trim()}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white transition hover:bg-slate-800 disabled:opacity-60"
                        >
                          Send reply
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </Layout>
    </AuthGuard>
  );
}
