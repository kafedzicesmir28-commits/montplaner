import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/serverSuperadmin';
import { getRequestIp, writeAuditEvent } from '@/lib/auditLog';

type SetPasswordBody = {
  user_id?: string;
  password?: string;
};

export async function PATCH(request: NextRequest) {
  try {
    const { admin, userId: actorUserId, email: actorEmail } = await requireSuperadmin(request);
    const body = (await request.json()) as SetPasswordBody;
    const userId = (body.user_id ?? '').trim();
    const password = body.password ?? '';

    if (!userId || !password) {
      return NextResponse.json({ error: 'user_id and password are required' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) throw error;

    await writeAuditEvent(admin, {
      action: 'user_password_reset',
      actor_user_id: actorUserId,
      actor_email: actorEmail,
      target_user_id: userId,
      target_type: 'user',
      target_id: userId,
      metadata: { password_length: password.length },
      ip: getRequestIp(request),
      user_agent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to set password';
    const status = message === 'Forbidden' ? 403 : message.includes('token') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
