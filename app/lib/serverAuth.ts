import { NextRequest } from 'next/server';
import { getSupabaseClients } from '@/lib/serverSuperadmin';

type Role = 'superadmin' | 'user';

export type AuthContext = {
  admin: ReturnType<typeof getSupabaseClients>['adminClient'];
  userId: string;
  email: string | null;
  role: Role;
  companyId: string | null;
};

function readBearer(request: NextRequest) {
  const header = request.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function requireAuthenticated(request: NextRequest): Promise<AuthContext> {
  const token = readBearer(request);
  if (!token) throw new Error('Missing bearer token');

  const { userClient, adminClient } = getSupabaseClients();
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(token);

  if (userError || !user) throw new Error('Invalid user token');

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role,company_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile || (profile.role !== 'superadmin' && profile.role !== 'user')) {
    throw new Error('Forbidden');
  }

  return {
    admin: adminClient,
    userId: user.id,
    email: user.email ?? null,
    role: profile.role,
    companyId: profile.company_id ?? null,
  };
}
