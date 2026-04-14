import type { SupabaseClient } from '@supabase/supabase-js';
import { t } from '@/lib/translations';

type CompanyEmbed = { name: string | null };

function unwrapCompany(c: CompanyEmbed | CompanyEmbed[] | null | undefined): CompanyEmbed | null {
  if (!c) return null;
  return Array.isArray(c) ? c[0] ?? null : c;
}

/**
 * Company name for print/PDF headers (same source as /settings).
 * Returns a non-empty display string (fallback when missing or on error).
 */
export async function fetchCompanyPrintName(client: SupabaseClient): Promise<string> {
  const fallback = t.printCompanyNameFallback;
  try {
    const {
      data: { user },
      error: uErr,
    } = await client.auth.getUser();
    if (uErr || !user) return fallback;

    const { data, error } = await client
      .from('profiles')
      .select('companies ( name )')
      .eq('id', user.id)
      .maybeSingle();

    if (error) return fallback;

    const row = data as { companies?: CompanyEmbed | CompanyEmbed[] | null } | null;
    const comp = unwrapCompany(row?.companies ?? null);
    const n = comp?.name?.trim();
    return n || fallback;
  } catch {
    return fallback;
  }
}
