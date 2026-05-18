import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { BACKUP_CSV_FILENAMES, BACKUP_TABLES, type BackupTableName } from '@/lib/backupTables';
import { requireSuperadmin } from '@/lib/serverSuperadmin';

type ImportJsonRow = Record<string, unknown>;
type BackupPayload = {
  version?: number;
  format?: string;
  exported_at?: string;
  tables?: Partial<Record<BackupTableName, ImportJsonRow[]>>;
};

const FILE_TO_TABLE: Record<string, BackupTableName> = Object.entries(BACKUP_CSV_FILENAMES).reduce(
  (acc, [table, filename]) => {
    acc[filename] = table as BackupTableName;
    return acc;
  },
  {} as Record<string, BackupTableName>
);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonBackup(content: string): Map<BackupTableName, ImportJsonRow[]> {
  const parsed: unknown = JSON.parse(content);
  if (!isPlainObject(parsed)) {
    throw new Error('Invalid backup.json payload');
  }

  const payload = parsed as BackupPayload;
  if (!isPlainObject(payload.tables)) {
    throw new Error('Invalid backup.json tables payload');
  }

  const rowsByTable = new Map<BackupTableName, ImportJsonRow[]>();
  for (const tableName of BACKUP_TABLES) {
    const maybeRows = payload.tables?.[tableName];
    if (!Array.isArray(maybeRows)) continue;
    const normalizedRows = maybeRows.filter((row): row is ImportJsonRow => isPlainObject(row));
    rowsByTable.set(tableName, normalizedRows);
  }
  return rowsByTable;
}

async function parseRowsFromZip(zip: JSZip) {
  const rowsByTable = new Map<BackupTableName, ImportJsonRow[]>();
  const jsonEntry = zip.file('backup.json');
  if (jsonEntry) {
    const jsonContent = await jsonEntry.async('string');
    return parseJsonBackup(jsonContent);
  }

  const entries = Object.keys(zip.files);
  const csvByTable = new Map<BackupTableName, string>();
  for (const entryName of entries) {
    const normalized = entryName.split('/').pop() ?? entryName;
    const tableName = FILE_TO_TABLE[normalized];
    if (!tableName) continue;
    if (zip.files[entryName]?.dir) continue;
    const csvContent = await zip.files[entryName].async('string');
    csvByTable.set(tableName, csvContent);
  }

  for (const tableName of BACKUP_TABLES) {
    const csvContent = csvByTable.get(tableName);
    if (!csvContent) continue;
    rowsByTable.set(tableName, parseCsvRows(csvContent));
  }
  return rowsByTable;
}

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

function extractCompanyIds(rows: ImportJsonRow[]) {
  const ids = new Set<string>();
  for (const row of rows) {
    const value = row.company_id;
    if (typeof value === 'string' && value.trim().length > 0) {
      ids.add(value.trim());
    }
  }
  return ids;
}

function buildAssignmentCompositeKey(row: ImportJsonRow) {
  const employeeId = typeof row.employee_id === 'string' ? row.employee_id.trim() : '';
  const date = typeof row.date === 'string' ? row.date.trim() : '';
  if (!employeeId || !date) return null;
  return `${employeeId}__${date}`;
}

async function filterExistingShiftAssignments(
  adminSelect: (employeeIds: string[]) => Promise<Array<{ employee_id?: string | null; date?: string | null }>>,
  rows: ImportJsonRow[]
) {
  if (!rows.length) return { rows, skipped: 0 };

  const employeeIds = Array.from(
    new Set(
      rows
        .map((row) => row.employee_id)
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
    )
  );

  const existingCompositeKeys = new Set<string>();
  const chunkSize = 150;
  for (let i = 0; i < employeeIds.length; i += chunkSize) {
    const slice = employeeIds.slice(i, i + chunkSize);
    const existingRows = await adminSelect(slice);
    for (const existing of existingRows) {
      const employeeId = typeof existing.employee_id === 'string' ? existing.employee_id.trim() : '';
      const date = typeof existing.date === 'string' ? existing.date.trim() : '';
      if (employeeId && date) {
        existingCompositeKeys.add(`${employeeId}__${date}`);
      }
    }
  }

  const seenIncoming = new Set<string>();
  let skipped = 0;
  const filtered = rows.filter((row) => {
    const composite = buildAssignmentCompositeKey(row);
    if (!composite) return true;
    if (existingCompositeKeys.has(composite)) {
      skipped += 1;
      return false;
    }
    if (seenIncoming.has(composite)) {
      skipped += 1;
      return false;
    }
    seenIncoming.add(composite);
    return true;
  });

  return { rows: filtered, skipped };
}

export async function POST(request: NextRequest) {
  try {
    const { admin } = await requireSuperadmin(request);
    const formData = await request.formData();
    const file = formData.get('file');
    const skipDuplicatesRaw = String(formData.get('skipDuplicates') ?? 'false').toLowerCase();
    const skipDuplicates = skipDuplicatesRaw === 'true' || skipDuplicatesRaw === '1' || skipDuplicatesRaw === 'on';

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Zip file is required' }, { status: 400 });
    }

    const content = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(content);
    const rowsByTable = await parseRowsFromZip(zip);
    const summaries: Array<{ table: BackupTableName; rows: number }> = [];
    let skippedDuplicates = 0;

    // Backward compatibility for old backups without companies.csv:
    // infer missing company ids from tenant tables and create placeholders
    // so FK checks on company_id do not fail.
    const inferredCompanyIds = new Set<string>();
    for (const tableName of ['stores', 'employees', 'shifts', 'shift_assignments', 'vacations'] as BackupTableName[]) {
      const rows = rowsByTable.get(tableName) ?? [];
      for (const id of extractCompanyIds(rows)) {
        inferredCompanyIds.add(id);
      }
    }

    const companyRows = rowsByTable.get('companies') ?? [];
    const existingCompanyIds = new Set(
      companyRows
        .map((row) => row.id)
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        .map((id) => id.trim())
    );
    const missingCompanyRows: ImportJsonRow[] = [];
    for (const companyId of inferredCompanyIds) {
      if (existingCompanyIds.has(companyId)) continue;
      missingCompanyRows.push({
        id: companyId,
        name: `Imported Company ${companyId.slice(0, 8)}`,
      });
    }
    if (missingCompanyRows.length > 0) {
      rowsByTable.set('companies', [...companyRows, ...missingCompanyRows]);
    }

    for (const tableName of BACKUP_TABLES) {
      let rows = rowsByTable.get(tableName) ?? [];
      if (!rows.length) continue;

      if (skipDuplicates && rows.length > 0) {
        if (tableName === 'shift_assignments') {
          const result = await filterExistingShiftAssignments(
            async (employeeIdChunk) => {
              const { data, error } = await admin
                .from('shift_assignments')
                .select('employee_id,date')
                .in('employee_id', employeeIdChunk);
              if (error) throw error;
              return (data ?? []) as Array<{ employee_id?: string | null; date?: string | null }>;
            },
            rows
          );
          rows = result.rows;
          skippedDuplicates += result.skipped;
        }
      }

      const count = await importTableRows(tableName, rows, async (targetTable, payload) => {
        const conflictTarget = targetTable === 'shift_assignments' ? 'employee_id,date' : 'id';
        const { error } = await admin.from(targetTable).upsert(payload, { onConflict: conflictTarget });
        if (error) throw error;
      });
      summaries.push({ table: tableName, rows: count });
    }

    return NextResponse.json({
      ok: true,
      imported: summaries,
      skipped_duplicates: skippedDuplicates,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Import failed';
    const status = message === 'Forbidden' ? 403 : message.includes('token') ? 401 : 500;
    const details =
      typeof error === 'object' && error !== null
        ? {
            code: 'code' in error ? String((error as { code?: unknown }).code ?? '') : undefined,
            hint: 'hint' in error ? String((error as { hint?: unknown }).hint ?? '') : undefined,
            details:
              'details' in error ? String((error as { details?: unknown }).details ?? '') : undefined,
          }
        : undefined;

    console.error('Admin import failed:', error);
    return NextResponse.json({ error: message, ...details }, { status });
  }
}
