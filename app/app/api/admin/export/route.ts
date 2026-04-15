import { NextRequest, NextResponse } from 'next/server';
import { Parser } from 'json2csv';
import JSZip from 'jszip';
import {
  BACKUP_CSV_FILENAMES,
  BACKUP_FALLBACK_FIELDS,
  BACKUP_TABLES,
  type BackupTableName,
} from '@/lib/backupTables';
import { requireSuperadmin } from '@/lib/serverSuperadmin';

type JsonRow = Record<string, unknown>;

async function fetchAllRows(
  tableName: BackupTableName,
  fetcher: (tableName: BackupTableName, from: number, to: number) => Promise<JsonRow[]>,
  pageSize = 1000
) {
  const rows: JsonRow[] = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const batch = await fetcher(tableName, from, to);
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export async function GET(request: NextRequest) {
  try {
    const { admin } = await requireSuperadmin(request);
    const tableData = await Promise.all(
      BACKUP_TABLES.map(async (table) => {
        const rows = await fetchAllRows(table, async (tableName, from, to) => {
          const { data, error } = await admin
            .from(tableName)
            .select('*')
            .order('id', { ascending: true })
            .range(from, to);
          if (error) throw error;
          return (data ?? []) as JsonRow[];
        });
        return { table, rows };
      })
    );

    const zip = new JSZip();
    tableData.forEach(({ table, rows }) => {
      const fields = rows.length
        ? Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
        : BACKUP_FALLBACK_FIELDS[table];
      const parser = new Parser<JsonRow>({ fields });
      zip.file(BACKUP_CSV_FILENAMES[table], parser.parse(rows));
    });

    const stamp = new Date().toISOString().replace(/:/g, '-').slice(0, 16);
    const zipFilename = `backup-${stamp}.zip`;
    const zipBuffer = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

    return new NextResponse(Buffer.from(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Export failed';
    const status = message === 'Forbidden' ? 403 : message.includes('token') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
