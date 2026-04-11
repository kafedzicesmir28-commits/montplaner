import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

export type ProfileRole = 'admin' | 'user' | 'superadmin';

export type TenantLoadResult =
  | { ok: true; companyId: string | null; role: ProfileRole }
  | {
      ok: false;
      reason: 'no_session' | 'profile_fetch' | 'missing_company' | 'invalid_role' | 'missing_profile';
      message?: string;
    };

export async function loadTenantFromSession(session: Session | null): Promise<TenantLoadResult> {
  if (!session?.user?.id) {
    return { ok: false, reason: 'no_session' };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: 'profile_fetch', message: error.message };
  }
  if (!data) {
    return { ok: false, reason: 'missing_profile' };
  }

  const roleStr = String(data.role || '');
  if (!['admin', 'user', 'superadmin'].includes(roleStr)) {
    return { ok: false, reason: 'invalid_role' };
  }
  const role = roleStr as ProfileRole;

  if (role === 'superadmin') {
    return { ok: true, companyId: data.company_id ?? null, role };
  }

  if (!data.company_id) {
    return { ok: false, reason: 'missing_company' };
  }

  return { ok: true, companyId: data.company_id, role };
}
