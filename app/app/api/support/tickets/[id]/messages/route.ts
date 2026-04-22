import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/serverAuth';
import { getRequestIp, writeAuditEvent } from '@/lib/auditLog';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { admin, userId, email: actorEmail, role, companyId } = await requireAuthenticated(request);
    const body = (await request.json()) as { message?: string };
    const message = (body.message ?? '').trim();
    if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });

    const { data: ticket, error: ticketError } = await admin
      .from('support_tickets')
      .select('id,company_id,status')
      .eq('id', id)
      .maybeSingle();
    if (ticketError) throw ticketError;
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    if (role !== 'superadmin' && ticket.company_id !== companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: inserted, error: insertError } = await admin
      .from('support_ticket_messages')
      .insert({
        ticket_id: id,
        author_user_id: userId,
        author_role_snapshot: role,
        message,
      })
      .select('id,ticket_id,author_user_id,author_role_snapshot,message,created_at')
      .single();
    if (insertError) throw insertError;

    const ticketUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (role === 'superadmin') {
      ticketUpdate.last_superadmin_reply_at = new Date().toISOString();
      if (ticket.status === 'open') ticketUpdate.status = 'in_progress';
    }
    const { error: updateError } = await admin.from('support_tickets').update(ticketUpdate).eq('id', id);
    if (updateError) throw updateError;

    await writeAuditEvent(admin, {
      action: 'ticket_replied',
      actor_user_id: userId,
      actor_email: actorEmail,
      target_type: 'support_ticket',
      target_id: id,
      company_id: ticket.company_id,
      metadata: { author_role: role },
      ip: getRequestIp(request),
      user_agent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ message: inserted }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to post message';
    const status = message === 'Forbidden' ? 403 : message.includes('token') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
