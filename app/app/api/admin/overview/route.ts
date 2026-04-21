import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/serverSuperadmin';

type CompanyRow = { id: string; name: string | null; created_at: string };
type EmployeeRow = { id: string; company_id: string };
type ProfileRow = {
  id: string;
  email: string | null;
  role: 'superadmin' | 'user';
  company_id: string | null;
  companies: { name: string | null } | Array<{ name: string | null }> | null;
};
type AuditLogRow = {
  id: string;
  action: string;
  actor_user_id: string | null;
  actor_email: string | null;
  target_type: string | null;
  target_id: string | null;
  target_email: string | null;
  company_id: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function readCompanyName(companies: ProfileRow['companies']) {
  if (!companies) return null;
  return Array.isArray(companies) ? (companies[0]?.name ?? null) : companies.name;
}

export async function GET(request: NextRequest) {
  try {
    const { admin } = await requireSuperadmin(request);

    const [{ data: companies, error: companiesError }, { data: employees, error: employeesError }] =
      await Promise.all([
        admin.from('companies').select('id,name,created_at').order('created_at', { ascending: true }),
        admin.from('employees').select('id,company_id'),
      ]);

    if (companiesError) throw companiesError;
    if (employeesError) throw employeesError;

    const companyRows = (companies ?? []) as CompanyRow[];
    const employeeRows = (employees ?? []) as EmployeeRow[];

    const employeesByCompany = employeeRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.company_id] = (acc[row.company_id] ?? 0) + 1;
      return acc;
    }, {});

    const companyStats = companyRows.map((c) => ({
      id: c.id,
      name: c.name ?? 'Unknown',
      created_at: c.created_at,
      employees_count: employeesByCompany[c.id] ?? 0,
    }));

    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id,email,role,company_id,companies(name)')
      .order('created_at', { ascending: false });
    if (profilesError) throw profilesError;

    const users = ((profiles ?? []) as ProfileRow[]).map((p) => ({
      id: p.id,
      email: p.email,
      role: p.role,
      company_id: p.company_id,
      company_name: readCompanyName(p.companies),
      last_login: null as string | null,
    }))
      .sort((a, b) => {
        if (a.role !== b.role) {
          return a.role === 'user' ? -1 : 1;
        }
        return String(a.email ?? '').localeCompare(String(b.email ?? ''));
      });

    let page = 1;
    const pageSize = 200;
    const authUsersById = new Map<string, string | null>();
    while (true) {
      const { data: authUsersData, error: authUsersError } = await admin.auth.admin.listUsers({
        page,
        perPage: pageSize,
      });
      if (authUsersError) throw authUsersError;
      const authUsers = authUsersData?.users ?? [];
      authUsers.forEach((u) => authUsersById.set(u.id, u.last_sign_in_at ?? null));
      if (authUsers.length < pageSize) break;
      page += 1;
    }

    users.forEach((u) => {
      u.last_login = authUsersById.get(u.id) ?? null;
    });

    let ownerLoginLogs: Array<{
      id: string;
      user_id: string | null;
      email: string | null;
      login_time: string;
      ip: string | null;
    }> = [];

    const { data: loginLogs, error: logsError } = await admin
      .from('login_logs')
      .select('id,user_id,email,login_time,ip')
      .order('login_time', { ascending: false })
      .limit(300);

    // Keep admin overview available even if login_logs table
    // is not yet migrated on this environment.
    if (!logsError) {
      const ownerIds = new Set(users.filter((u) => u.role === 'user').map((u) => u.id));
      ownerLoginLogs = (loginLogs ?? []).filter((log) => {
        const row = log as { user_id?: string | null };
        return row.user_id ? ownerIds.has(row.user_id) : false;
      });
    }

    let auditLogs: AuditLogRow[] = [];
    const { data: auditData, error: auditError } = await admin
      .from('audit_logs')
      .select(
        'id,action,actor_user_id,actor_email,target_type,target_id,target_email,company_id,ip,user_agent,metadata,created_at'
      )
      .order('created_at', { ascending: false })
      .limit(500);
    if (!auditError) {
      auditLogs = (auditData ?? []) as AuditLogRow[];
    }

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const events24h = auditLogs.filter((event) => {
      const ts = new Date(event.created_at).getTime();
      return !Number.isNaN(ts) && ts >= oneDayAgo;
    });
    const eventsByAction24h = Object.entries(
      events24h.reduce<Record<string, number>>((acc, row) => {
        acc[row.action] = (acc[row.action] ?? 0) + 1;
        return acc;
      }, {})
    )
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      companies: companyStats,
      users,
      stats: {
        total_companies: companyStats.length,
        total_users: users.length,
        audit_events_24h: events24h.length,
        events_by_action_24h: eventsByAction24h,
        employees_per_company: companyStats.map((c) => ({
          company_id: c.id,
          company_name: c.name,
          employees: c.employees_count,
        })),
      },
      login_logs: ownerLoginLogs.slice(0, 100),
      audit_logs: auditLogs.slice(0, 150),
    });
  } catch (error: unknown) {
    console.error('admin overview error:', error);
    const message = error instanceof Error ? error.message : 'Failed to load admin overview';
    const normalized = message.toLowerCase();
    const status =
      message === 'Forbidden'
        ? 403
        : normalized.includes('token') || normalized.includes('api key')
          ? 401
          : normalized.includes('missing required environment variable')
            ? 500
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
