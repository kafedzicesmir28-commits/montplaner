import { NextRequest, NextResponse } from 'next/server';
import { requireSuperadmin } from '@/lib/serverSuperadmin';

export async function POST(request: NextRequest) {
  try {
    const { admin } = await requireSuperadmin(request);
    const body = (await request.json()) as { name?: string };
    const name = (body.name ?? '').trim();

    if (!name) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('companies')
      .insert({ name })
      .select('id,name,created_at')
      .single();

    if (error) throw error;
    return NextResponse.json({ company: data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create company';
    const status = message === 'Forbidden' ? 403 : message.includes('token') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
