import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { BACKUP_TABLES, type BackupTableName } from '@/lib/backupTables';
import { requireSuperadmin } from '@/lib/serverSuperadmin';

type JsonRow = Record<string, unknown>;
type BackupPayload = {
  version: 2;
  format: 'json';
  exported_at: string;
  tables: Record<BackupTableName, JsonRow[]>;
};

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

    const tables = tableData.reduce(
      (acc, item) => {
        acc[item.table] = item.rows;
        return acc;
      },
      {} as Record<BackupTableName, JsonRow[]>
    );

    const payload: BackupPayload = {
      version: 2,
      format: 'json',
      exported_at: new Date().toISOString(),
      tables,
    };

    const zip = new JSZip();
    zip.file('backup.json', JSON.stringify(payload, null, 2));

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
