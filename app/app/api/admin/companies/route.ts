import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/serverSuperadmin';
import { getRequestIp, writeAuditEvent } from '@/lib/auditLog';

export async function POST(request: NextRequest) {
  try {
    const { admin, userId, email: actorEmail } = await requireSuperadmin(request);
    const body = (await request.json()) as { name?: string };
    const name = (body.name ?? '').trim();

    if (!name) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('companies')
      .insert({ name })
      .select('id,name,created_at')
      .single();

    if (error) throw error;

    await writeAuditEvent(admin, {
      action: 'company_created',
      actor_user_id: userId,
      actor_email: actorEmail,
      company_id: data.id,
      target_type: 'company',
      target_id: data.id,
      metadata: { company_name: data.name ?? name },
      ip: getRequestIp(request),
      user_agent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ company: data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create company';
    const status = message === 'Forbidden' ? 403 : message.includes('token') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
