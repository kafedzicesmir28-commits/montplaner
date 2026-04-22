import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticated } from '@/lib/serverAuth';
import { getRequestIp, writeAuditEvent } from '@/lib/auditLog';

type CreateTicketBody = {
  subject?: string;
  message?: string;
  request_type?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
};

export async function GET(request: NextRequest) {
  try {
    const { admin, role, companyId, userId } = await requireAuthenticated(request);

    // User should see only current active ticket (no history).
    if (role !== 'superadmin') {
      const { data, error } = await admin
        .from('support_tickets')
        .select('id,company_id,created_by,subject,request_type,status,priority,created_at,updated_at,closed_at,expires_at,last_superadmin_reply_at')
        .eq('company_id', companyId)
        .eq('created_by', userId)
        .in('status', ['open', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return NextResponse.json({ tickets: data ?? [] });
    }

    const query = admin
      .from('support_tickets')
      .select('id,company_id,created_by,subject,request_type,status,priority,created_at,updated_at,closed_at,expires_at,last_superadmin_reply_at')
      .order('created_at', { ascending: false })
      .limit(200);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ tickets: data ?? [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load tickets';
    const status = message === 'Forbidden' ? 403 : message.includes('token') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { admin, userId, email: actorEmail, role, companyId } = await requireAuthenticated(request);
    const body = (await request.json()) as CreateTicketBody;
    const subject = (body.subject ?? '').trim();
    const message = (body.message ?? '').trim();
    const requestType = (body.request_type ?? 'general').trim() || 'general';
    const priority = body.priority ?? 'normal';

    if (!subject || !message) {
      return NextResponse.json({ error: 'subject and message are required' }, { status: 400 });
    }
    if (role !== 'superadmin' && !companyId) {
      return NextResponse.json({ error: 'Missing company context' }, { status: 400 });
    }

    const ticketCompanyId = role === 'superadmin' ? companyId : companyId;
    const { data: inserted, error: insertError } = await admin
      .from('support_tickets')
      .insert({
        company_id: ticketCompanyId,
        created_by: userId,
        subject,
        request_type: requestType,
        priority,
      })
      .select('id,company_id,created_by,subject,request_type,status,priority,created_at,expires_at')
      .single();
    if (insertError) throw insertError;

    const { error: messageError } = await admin.from('support_ticket_messages').insert({
      ticket_id: inserted.id,
      author_user_id: userId,
      author_role_snapshot: role,
      message,
    });
    if (messageError) throw messageError;

    await writeAuditEvent(admin, {
      action: 'ticket_created',
      actor_user_id: userId,
      actor_email: actorEmail,
      target_type: 'support_ticket',
      target_id: inserted.id,
      company_id: inserted.company_id,
      metadata: { subject, request_type: requestType, priority },
      ip: getRequestIp(request),
      user_agent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ ticket: inserted }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create ticket';
    const status = message === 'Forbidden' ? 403 : message.includes('token') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
