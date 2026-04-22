import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/serverAuth';
import { getRequestIp, writeAuditEvent } from '@/lib/auditLog';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { admin, role, companyId, userId } = await requireAuthenticated(request);

    const { data: ticket, error: ticketError } = await admin
      .from('support_tickets')
      .select('id,company_id,created_by,subject,request_type,status,priority,created_at,updated_at,closed_at,expires_at,last_superadmin_reply_at')
      .eq('id', id)
      .maybeSingle();
    if (ticketError) throw ticketError;
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

    if (role !== 'superadmin') {
      const isOwnActiveTicket =
        ticket.company_id === companyId &&
        ticket.created_by === userId &&
        (ticket.status === 'open' || ticket.status === 'in_progress');
      if (!isOwnActiveTicket) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const { data: messages, error: messagesError } = await admin
      .from('support_ticket_messages')
      .select('id,ticket_id,author_user_id,author_role_snapshot,message,created_at')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });
    if (messagesError) throw messagesError;

    return NextResponse.json({ ticket, messages: messages ?? [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load ticket';
    const status = message === 'Forbidden' ? 403 : message.includes('token') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { admin, userId, email: actorEmail, role, companyId } = await requireAuthenticated(request);
    const body = (await request.json()) as { status?: 'open' | 'in_progress' | 'resolved' | 'closed' };
    const nextStatus = body.status;
    if (!nextStatus) return NextResponse.json({ error: 'status is required' }, { status: 400 });

    const { data: current, error: currentError } = await admin
      .from('support_tickets')
      .select('id,company_id,status')
      .eq('id', id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    if (role !== 'superadmin' && current.company_id !== companyId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload: Record<string, unknown> = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };
    if (nextStatus === 'closed' || nextStatus === 'resolved') {
      payload.closed_at = new Date().toISOString();
    } else {
      payload.closed_at = null;
    }

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
    const message = error instanceof Error ? error.message : 'Failed to update ticket';
    const status = message === 'Forbidden' ? 403 : message.includes('token') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
