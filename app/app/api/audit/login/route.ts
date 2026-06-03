import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClients } from '@/lib/serverSuperadmin';
import { getRequestIp, writeAuditEvent } from '@/lib/auditLog';

function readBearer(request: NextRequest) {
  const header = request.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function POST(request: NextRequest) {
  try {
    const token = readBearer(request);
    if (!token) {
      return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });
    }

    const { userClient, adminClient } = getSupabaseClients();
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid user token' }, { status: 401 });
    }

    const ip = getRequestIp(request);
    const userAgent = request.headers.get('user-agent');
    const email = user.email ?? null;

    await adminClient.from('login_logs').insert({
      user_id: user.id,
      email,
      ip,
    });

    await writeAuditEvent(adminClient, {
      action: 'auth_login_success',
      actor_user_id: user.id,
      actor_email: email,
      target_user_id: user.id,
      target_type: 'user',
      target_id: user.id,
      target_email: email,
      ip,
      user_agent: userAgent,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to track login';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
