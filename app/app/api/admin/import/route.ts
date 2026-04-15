import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { BACKUP_CSV_FILENAMES, type BackupTableName } from '@/lib/backupTables';
import { requireSuperadmin } from '@/lib/serverSuperadmin';

type ImportJsonRow = Record<string, unknown>;

const FILE_TO_TABLE: Record<string, BackupTableName> = Object.entries(BACKUP_CSV_FILENAMES).reduce(
  (acc, [table, filename]) => {
    acc[filename] = table as BackupTableName;
    return acc;
  },
  {} as Record<string, BackupTableName>
);

function parseCsvRows(csv: string): ImportJsonRow[] {
  const parsed = Papa.parse<ImportJsonRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transform: (value: string) => {
      const trimmed = value.trim();
      if (trimmed === '') return '';
      return trimmed;
    },
  });

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.message ?? 'Failed to parse CSV');
  }

  return (parsed.data ?? []).map((row) => {
    const normalized: ImportJsonRow = {};
    Object.entries(row).forEach(([key, value]) => {
      if (typeof value !== 'string') {
        normalized[key] = value;
        return;
      }
      if (value === '') {
        normalized[key] = null;
        return;
      }
      if (value.toLowerCase() === 'true') {
        normalized[key] = true;
        return;
      }
      if (value.toLowerCase() === 'false') {
        normalized[key] = false;
        return;
      }
      normalized[key] = value;
    });
    return normalized;
  });
}

async function importTableRows(
  tableName: BackupTableName,
  rows: ImportJsonRow[],
  upsert: (tableName: BackupTableName, rows: ImportJsonRow[]) => Promise<void>
) {
  if (!rows.length) return 0;
  const chunk = 400;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const batch = rows.slice(i, i + chunk);
    await upsert(tableName, batch);
    inserted += batch.length;
  }
  return inserted;
}

export async function POST(request: NextRequest) {
  try {
    const { admin } = await requireSuperadmin(request);
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Zip file is required' }, { status: 400 });
    }

    const content = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(content);
    const entries = Object.keys(zip.files);
    const summaries: Array<{ table: BackupTableName; rows: number }> = [];

    for (const entryName of entries) {
      const normalized = entryName.split('/').pop() ?? entryName;
      const tableName = FILE_TO_TABLE[normalized];
      if (!tableName) continue;
      if (zip.files[entryName]?.dir) continue;

      const csvContent = await zip.files[entryName].async('string');
      const rows = parseCsvRows(csvContent);

      const count = await importTableRows(tableName, rows, async (targetTable, payload) => {
        const { error } = await admin.from(targetTable).upsert(payload, { onConflict: 'id' });
        if (error) throw error;
      });
      summaries.push({ table: tableName, rows: count });
    }

    return NextResponse.json({
      ok: true,
      imported: summaries,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Import failed';
    const status = message === 'Forbidden' ? 403 : message.includes('token') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
