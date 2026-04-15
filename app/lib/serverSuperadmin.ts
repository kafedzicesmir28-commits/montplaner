import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

type AuthedContext = {
  admin: SupabaseClient;
  userId: string;
  email: string | null;
};

function getEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getSupabaseClients() {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anon = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const serviceRole = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  const userClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const adminClient = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { userClient, adminClient };
}

function readBearer(request: NextRequest) {
  const header = request.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function requireSuperadmin(request: NextRequest): Promise<AuthedContext> {
  const token = readBearer(request);
  if (!token) {
    throw new Error('Missing bearer token');
  }

  const { userClient, adminClient } = getSupabaseClients();
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(token);

  if (userError || !user) {
    throw new Error('Invalid user token');
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile || profile.role !== 'superadmin') {
    throw new Error('Forbidden');
  }

  return {
    admin: adminClient,
    userId: user.id,
    email: user.email ?? null,
  };
}
