import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Parser } from 'json2csv';
import JSZip from 'jszip';

export const runtime = 'nodejs';

type TableName = 'employees' | 'shifts' | 'stores' | 'shift_assignments' | 'vacations';
type JsonRow = Record<string, unknown>;

const TABLES: TableName[] = ['employees', 'shifts', 'stores', 'shift_assignments', 'vacations'];
const CSV_FILENAMES: Record<TableName, string> = {
  employees: 'employees.csv',
  shifts: 'shifts.csv',
  stores: 'stores.csv',
  shift_assignments: 'planner.csv',
  vacations: 'vacations.csv',
};
const FALLBACK_FIELDS: Record<TableName, string[]> = {
  employees: [
    'id',
    'name',
    'employment_start_date',
    'birth_date',
    'is_active',
    'sort_order',
    'hourly_rate',
    'company_id',
    'created_at',
  ],
  shifts: ['id', 'name', 'code', 'start_time', 'end_time', 'break_minutes', 'store_id', 'is_global', 'company_id'],
  stores: ['id', 'name', 'color', 'company_id'],
  shift_assignments: [
    'id',
    'employee_id',
    'date',
    'shift_id',
    'store_id',
    'assignment_type',
    'custom_start_time',
    'custom_end_time',
    'custom_break_minutes',
    'company_id',
  ],
  vacations: ['id', 'employee_id', 'start_date', 'end_date', 'company_id'],
};

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getRequestSecret(req: NextRequest) {
  const fromQuery = req.nextUrl.searchParams.get('secret');
  const fromHeader = req.headers.get('x-backup-secret');
  const authHeader = req.headers.get('authorization');
  const bearer = authHeader?.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : null;
  return fromQuery ?? fromHeader ?? bearer ?? '';
}

function isCronRequest(req: NextRequest) {
  const cronHeader = req.headers.get('x-vercel-cron');
  const userAgent = (req.headers.get('user-agent') ?? '').toLowerCase();
  return cronHeader === '1' || userAgent.includes('vercel-cron');
}

async function fetchAllRows(admin: SupabaseClient, tableName: TableName, pageSize = 1000): Promise<JsonRow[]> {
  const rows: JsonRow[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await admin.from(tableName).select('*').order('id', { ascending: true }).range(from, to);
    if (error) {
      throw new Error(`Failed to fetch ${tableName}: ${error.message}`);
    }
    const batch = (data ?? []) as JsonRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

function toCsv(tableName: TableName, rows: JsonRow[]) {
  const fields =
    rows.length > 0
      ? Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
      : FALLBACK_FIELDS[tableName];
  const parser = new Parser<JsonRow>({ fields });
  return parser.parse(rows);
}

async function uploadZipBackup(admin: SupabaseClient, filename: string, zipBuffer: Uint8Array): Promise<string> {
  const bucket = process.env.BACKUP_STORAGE_BUCKET || 'backups';
  const { error } = await admin.storage.from(bucket).upload(filename, zipBuffer, {
    contentType: 'application/zip',
    upsert: true,
  });
  if (error) {
    throw new Error(`Failed to upload backup to storage bucket "${bucket}": ${error.message}`);
  }
  return bucket;
}

export async function GET(req: NextRequest) {
  try {
    const startedAt = new Date();
    console.log('Backup started at:', startedAt.toISOString());

    const isCron = isCronRequest(req);
    const backupSecret = process.env.BACKUP_API_SECRET || '';
    const providedSecret = getRequestSecret(req);
    const hasValidSecret = !!backupSecret && providedSecret === backupSecret;

    if (!isCron && !hasValidSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
    const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const tableData = await Promise.all(
      TABLES.map(async (table) => {
        const rows = await fetchAllRows(admin, table);
        return { table, rows };
      }),
    );

    const zip = new JSZip();
    for (const { table, rows } of tableData) {
      zip.file(CSV_FILENAMES[table], toCsv(table, rows));
    }

    const stamp = startedAt.toISOString().replace(/:/g, '-').slice(0, 16);
    const zipFilename = `backup-${stamp}.zip`;
    const zipBuffer = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

    const shouldUpload = isCron || req.nextUrl.searchParams.get('store') === '1';
    if (shouldUpload) {
      const bucket = await uploadZipBackup(admin, zipFilename, zipBuffer);
      console.log('Backup completed');
      return NextResponse.json({
        ok: true,
        message: 'Backup created and uploaded.',
        bucket,
        file: zipFilename,
        tables: tableData.map(({ table, rows }) => ({ table, count: rows.length })),
      });
    }

    console.log('Backup completed');
    return new NextResponse(Buffer.from(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Backup failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
