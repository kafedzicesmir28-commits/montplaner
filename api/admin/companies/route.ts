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

export async function PATCH(request: NextRequest) {
  try {
    const { admin } = await requireSuperadmin(request);
    const body = (await request.json()) as { id?: string; name?: string };
    const id = (body.id ?? '').trim();
    const name = (body.name ?? '').trim();
    if (!id || !name) {
      return NextResponse.json({ error: 'id and name are required' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('companies')
      .update({ name })
      .eq('id', id)
      .select('id,name,created_at')
      .single();
    if (error) throw error;
    return NextResponse.json({ company: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update company';
    const status = message === 'Forbidden' ? 403 : message.includes('token') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { admin, userId: actorUserId, email: actorEmail } = await requireSuperadmin(request);
    const body = (await request.json()) as { id?: string; confirm_text?: string };
    const id = (body.id ?? '').trim();
    const confirmText = (body.confirm_text ?? '').trim();
    if (!id || !confirmText) {
      return NextResponse.json({ error: 'id and confirm_text are required' }, { status: 400 });
    }

    const { data: company, error: companyError } = await admin
      .from('companies')
      .select('id,name')
      .eq('id', id)
      .maybeSingle();
    if (companyError) throw companyError;
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    if (confirmText !== company.name) {
      return NextResponse.json(
        { error: 'Confirmation text must match the exact company name' },
        { status: 400 }
      );
    }

    const { data: profileRows, error: profileReadError } = await admin
      .from('profiles')
      .select('id,email')
      .eq('company_id', id);
    if (profileReadError) throw profileReadError;
    const profileIds = (profileRows ?? []).map((row) => row.id);

    const { data: tickets, error: ticketsError } = await admin
      .from('support_tickets')
      .select('id')
      .eq('company_id', id);
    if (ticketsError) throw ticketsError;
    const ticketIds = (tickets ?? []).map((t) => t.id);
    if (ticketIds.length > 0) {
      const { error: msgDeleteError } = await admin
        .from('support_ticket_messages')
        .delete()
        .in('ticket_id', ticketIds);
      if (msgDeleteError) throw msgDeleteError;
    }
    const { error: ticketsDeleteError } = await admin.from('support_tickets').delete().eq('company_id', id);
    if (ticketsDeleteError) throw ticketsDeleteError;

    const { error: assignmentsDeleteError } = await admin
      .from('shift_assignments')
      .delete()
      .eq('company_id', id);
    if (assignmentsDeleteError) throw assignmentsDeleteError;

    const { error: vacationsDeleteError } = await admin.from('vacations').delete().eq('company_id', id);
    if (vacationsDeleteError) throw vacationsDeleteError;

    const { error: shiftsDeleteError } = await admin.from('shifts').delete().eq('company_id', id);
    if (shiftsDeleteError) throw shiftsDeleteError;

    const { error: storesDeleteError } = await admin.from('stores').delete().eq('company_id', id);
    if (storesDeleteError) throw storesDeleteError;

    const { error: employeesDeleteError } = await admin.from('employees').delete().eq('company_id', id);
    if (employeesDeleteError) throw employeesDeleteError;

    const { error: auditDeleteError } = await admin.from('audit_logs').delete().eq('company_id', id);
    if (auditDeleteError) throw auditDeleteError;

    const { error: profilesDeleteError } = await admin.from('profiles').delete().eq('company_id', id);
    if (profilesDeleteError) throw profilesDeleteError;

    for (const profileId of profileIds) {
      const { error: authDeleteError } = await admin.auth.admin.deleteUser(profileId);
      if (authDeleteError) throw authDeleteError;
    }

    const { error: companyDeleteError } = await admin.from('companies').delete().eq('id', id);
    if (companyDeleteError) throw companyDeleteError;

    await writeAuditEvent(admin, {
      action: 'company_deleted',
      actor_user_id: actorUserId,
      actor_email: actorEmail,
      company_id: null,
      target_type: 'company',
      target_id: id,
      metadata: { deleted_company_name: company.name, deleted_user_count: profileIds.length },
      ip: getRequestIp(request),
      user_agent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ ok: true, deleted_company_id: id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete company';
    const status = message === 'Forbidden' ? 403 : message.includes('token') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
