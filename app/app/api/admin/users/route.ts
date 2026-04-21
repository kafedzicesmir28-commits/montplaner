import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/serverSuperadmin';
import { getRequestIp, writeAuditEvent } from '@/lib/auditLog';

type CreateUserBody = {
  email?: string;
  password?: string;
  company_id?: string | null;
  role?: 'superadmin' | 'user';
};

export async function POST(request: NextRequest) {
  try {
    const { admin, userId: actorUserId, email: actorEmail } = await requireSuperadmin(request);
    const body = (await request.json()) as CreateUserBody;

    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    const role = body.role === 'superadmin' ? 'superadmin' : 'user';
    const companyId = body.company_id ?? null;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }
    if (role !== 'superadmin' && !companyId) {
      return NextResponse.json({ error: 'company_id is required for non-superadmin users' }, { status: 400 });
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: email.split('@')[0] ?? email },
    });
    if (createError) throw createError;

    const userId = created.user?.id;
    if (!userId) throw new Error('Failed to create auth user');

    const { error: profileError } = await admin.from('profiles').upsert({
      id: userId,
      email,
      role,
      company_id: role === 'superadmin' ? null : companyId,
    });
    if (profileError) throw profileError;

    await writeAuditEvent(admin, {
      action: 'user_created',
      actor_user_id: actorUserId,
      actor_email: actorEmail,
      target_user_id: userId,
      company_id: role === 'superadmin' ? null : companyId,
      target_type: 'user',
      target_id: userId,
      target_email: email,
      metadata: {
        role,
        company_id: role === 'superadmin' ? null : companyId,
      },
      ip: getRequestIp(request),
      user_agent: request.headers.get('user-agent'),
    });

    return NextResponse.json({
      user: {
        id: userId,
        email,
        role,
        company_id: role === 'superadmin' ? null : companyId,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create user';
    const status = message === 'Forbidden' ? 403 : message.includes('token') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
