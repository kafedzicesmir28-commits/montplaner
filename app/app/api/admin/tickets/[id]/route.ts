import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/serverSuperadmin';
import { getRequestIp, writeAuditEvent } from '@/lib/auditLog';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { admin, userId, email: actorEmail } = await requireSuperadmin(request);
    const body = (await request.json()) as { status?: 'open' | 'in_progress' | 'resolved' | 'closed'; delete?: boolean };

    if (body.delete) {
      const { data: current, error: currentError } = await admin
        .from('support_tickets')
        .select('id,company_id,status')
        .eq('id', id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

      const { error } = await admin.from('support_tickets').delete().eq('id', id);
      if (error) throw error;
      await writeAuditEvent(admin, {
        action: 'ticket_closed',
        actor_user_id: userId,
        actor_email: actorEmail,
        target_type: 'support_ticket',
        target_id: id,
        company_id: current.company_id,
        metadata: { action: 'deleted', previous_status: current.status },
        ip: getRequestIp(request),
        user_agent: request.headers.get('user-agent'),
      });
      return NextResponse.json({ ok: true });
    }

    const nextStatus = body.status;
    if (!nextStatus) return NextResponse.json({ error: 'status or delete is required' }, { status: 400 });

    const { data: current, error: currentError } = await admin
      .from('support_tickets')
      .select('id,company_id,status')
      .eq('id', id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

    const payload: Record<string, unknown> = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
      closed_at: nextStatus === 'closed' || nextStatus === 'resolved' ? new Date().toISOString() : null,
    };
    const { data: updated, error: updateError } = await admin
      .from('support_tickets')
      .update(payload)
      .eq('id', id)
      .select('id,company_id,status,closed_at,updated_at')
      .single();
    if (updateError) throw updateError;

    await writeAuditEvent(admin, {
      action: nextStatus === 'closed' || nextStatus === 'resolved' ? 'ticket_closed' : 'ticket_status_changed',
      actor_user_id: userId,
      actor_email: actorEmail,
      target_type: 'support_ticket',
      target_id: id,
      company_id: updated.company_id,
      metadata: { previous_status: current.status, next_status: nextStatus },
      ip: getRequestIp(request),
      user_agent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ ticket: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update admin ticket';
    const status = message === 'Forbidden' ? 403 : message.includes('token') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
