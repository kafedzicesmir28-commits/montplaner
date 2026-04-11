import { createClient } from '@supabase/supabase-js';

export class AdminHttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function requireSuperAdmin(request: Request): Promise<{ userId: string }> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AdminHttpError(401, 'Missing authorization');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new AdminHttpError(500, 'Missing Supabase URL or anon key');
  }

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser();
  if (userErr || !user) {
    throw new AdminHttpError(401, 'Invalid session');
  }

  const { data: profile, error: profileErr } = await client
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileErr) {
    throw new AdminHttpError(500, profileErr.message);
  }
  if (profile?.role !== 'superadmin') {
    throw new AdminHttpError(403, 'Forbidden');
  }

  return { userId: user.id };
}

export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new AdminHttpError(503, 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
