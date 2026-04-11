import { NextResponse } from 'next/server';
import { AdminHttpError, createServiceRoleClient, requireSuperAdmin } from '../_lib';

type CreateUserBody = {
  email?: string;
  password?: string;
  company_id?: string;
  role?: 'admin' | 'user' | 'superadmin';
};

export async function POST(request: Request) {
  try {
    await requireSuperAdmin(request);
    const admin = createServiceRoleClient();

    const body = (await request.json()) as CreateUserBody;
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const companyId = String(body.company_id || '').trim();
    const role = body.role === 'admin' || body.role === 'superadmin' ? body.role : 'user';

    if (!email || !password || !companyId) {
      return NextResponse.json({ error: 'email, password, and company_id are required' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr || !created?.user?.id) {
      return NextResponse.json(
        { error: createErr?.message || 'Failed to create auth user' },
        { status: 400 }
      );
    }

    const userId = created.user.id;

    const { error: profileErr } = await admin.from('profiles').insert({
      id: userId,
      company_id: companyId,
      role,
      email,
    });

    if (profileErr) {
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: profileErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, user_id: userId });
  } catch (e: unknown) {
    if (e instanceof AdminHttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
