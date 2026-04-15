import { supabase } from '@/lib/supabaseClient';
import { getSessionSafe, getUserSafe } from '@/lib/supabaseAuthSafe';

export type AppRole = 'superadmin' | 'user';

export type AuthProfile = {
  id: string;
  email: string | null;
  role: AppRole;
  company_id: string | null;
  company_name: string | null;
};

type ProfileQueryRow = {
  id: string;
  email: string | null;
  role: AppRole;
  company_id: string | null;
  companies: { name: string | null } | Array<{ name: string | null }> | null;
};

function parseCompanyName(companies: ProfileQueryRow['companies']) {
  if (!companies) return null;
  if (Array.isArray(companies)) return companies[0]?.name ?? null;
  return companies.name ?? null;
}

export async function getCurrentAuthProfile(): Promise<AuthProfile | null> {
  const user = await getUserSafe();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, company_id, companies(name)')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as ProfileQueryRow;
  return {
    id: row.id,
    email: row.email ?? user.email ?? null,
    role: row.role,
    company_id: row.company_id,
    company_name: parseCompanyName(row.companies),
  };
}

export async function getCurrentAccessToken(): Promise<string | null> {
  const session = await getSessionSafe();
  return session?.access_token ?? null;
}
