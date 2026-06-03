import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/serverSuperadmin';

const MAX_LIMIT = 200;

export async function GET(request: NextRequest) {
  try {
    const { admin } = await requireSuperadmin(request);
    const type = request.nextUrl.searchParams.get('type');
    const limitRaw = Number(request.nextUrl.searchParams.get('limit') ?? '100');
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(1, Math.floor(limitRaw)), MAX_LIMIT)
      : 100;

    if (type === 'login') {
      const { data: profiles } = await admin.from('profiles').select('id').eq('role', 'user');
      const ownerIds = new Set((profiles ?? []).map((p) => p.id as string));

      const { data: loginLogs, error } = await admin
        .from('login_logs')
        .select('id,user_id,email,login_time,ip')
        .order('login_time', { ascending: false })
        .limit(limit * 3);

      if (error) throw error;

      const rows = (loginLogs ?? [])
        .filter((log) => {
          const uid = (log as { user_id?: string | null }).user_id;
          return uid ? ownerIds.has(uid) : false;
        })
        .slice(0, limit);

      return NextResponse.json({ logs: rows, limit });
    }

    if (type === 'audit') {
      const { data: auditData, error } = await admin
        .from('audit_logs')
        .select(
          'id,action,actor_user_id,actor_email,target_type,target_id,target_email,company_id,ip,user_agent,metadata,created_at'
        )
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return NextResponse.json({ logs: auditData ?? [], limit });
    }

    return NextResponse.json({ error: 'Invalid type. Use type=login or type=audit.' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load logs';
    const status = message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
