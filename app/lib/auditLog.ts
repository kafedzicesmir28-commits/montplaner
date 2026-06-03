import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type AuditEventInput = {
  action: string;
  actor_user_id?: string | null;
  actor_email?: string | null;
  target_user_id?: string | null;
  company_id?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  target_email?: string | null;
  metadata?: Record<string, JsonValue> | null;
  ip?: string | null;
  user_agent?: string | null;
};

function isMissingTableError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String(error.code ?? '') : '';
  const message = 'message' in error ? String(error.message ?? '').toLowerCase() : '';
  return code === '42P01' || message.includes('relation') && message.includes('audit_logs');
}

export function getRequestIp(request: NextRequest) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') ?? null;
}

export async function writeAuditEvent(admin: SupabaseClient, event: AuditEventInput) {
  const payload = {
    action: event.action,
    actor_user_id: event.actor_user_id ?? null,
    actor_email: event.actor_email ?? null,
    target_user_id: event.target_user_id ?? null,
    company_id: event.company_id ?? null,
    target_type: event.target_type ?? null,
    target_id: event.target_id ?? null,
    target_email: event.target_email ?? null,
    metadata: event.metadata ?? {},
    ip: event.ip ?? null,
    user_agent: event.user_agent ?? null,
  };

  const { error } = await admin.from('audit_logs').insert(payload);
  if (!error) return;

  if (isMissingTableError(error)) {
    return;
  }

  console.error('Failed to write audit event:', error);
}
