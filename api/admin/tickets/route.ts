import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/serverSuperadmin';

function isMissingTicketsTable(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String(error.code ?? '') : '';
  const message = 'message' in error ? String(error.message ?? '').toLowerCase() : '';
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (message.includes('relation') && message.includes('support_tickets')) ||
    (message.includes('could not find') && message.includes('support_tickets'))
  );
}

export async function GET(request: NextRequest) {
  try {
    const { admin } = await requireSuperadmin(request);
    const status = (request.nextUrl.searchParams.get('status') ?? '').trim();
    const includeClosed = request.nextUrl.searchParams.get('includeClosed') === 'true';

    let query = admin
      .from('support_tickets')
      .select('id,company_id,created_by,subject,request_type,status,priority,created_at,updated_at,closed_at,expires_at,last_superadmin_reply_at')
      .order('created_at', { ascending: false })
      .limit(300);

    if (status) query = query.eq('status', status);
    if (!includeClosed && !status) query = query.neq('status', 'closed');

    const { data, error } = await query;
    if (error) {
      // Keep admin UI available even before ticket migration is applied.
      if (isMissingTicketsTable(error)) {
        return NextResponse.json({ tickets: [] });
      }
      throw error;
    }

    const now = Date.now();
    const tickets = (data ?? []).map((row) => {
      const expiresTs = new Date(row.expires_at).getTime();
      const isOverdue = Number.isFinite(expiresTs) && expiresTs < now && row.status !== 'closed' && row.status !== 'resolved';
      return { ...row, is_overdue: isOverdue };
    });

    return NextResponse.json({ tickets });
  } catch (error: unknown) {
    console.error('admin tickets error:', error);
    const message = error instanceof Error ? error.message : 'Failed to load admin tickets';
    const status = message === 'Forbidden' ? 403 : message.includes('token') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
