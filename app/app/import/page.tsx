'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Papa, { ParseError } from 'papaparse';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabaseClient';
import { t } from '@/lib/translations';

type ParsedEmployeeRow = {
  name: string;
  position: string;
};

type CsvRawRow = Record<string, unknown>;

const TEMPLATE_CSV = 'name,position\nSanja,Worker\n';

function normalizeHeader(value: string) {
  return value.trim().toLowerCase();
}

function getStringCell(row: CsvRawRow, key: string): string {
  const entry = row[key];
  return typeof entry === 'string' ? entry.trim() : '';
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<ParsedEmployeeRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [existingEmployeesCount, setExistingEmployeesCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hasPreview = previewRows.length > 0;
  const importDisabled = importing || uploading || !hasPreview;

  const rowsReadyLabel = useMemo(() => {
    if (!hasPreview) return '';
    return `${previewRows.length} ${t.importRowsReady}`;
  }, [hasPreview, previewRows.length]);

  const fetchEmployeesCount = async () => {
    const { count, error } = await supabase.from('employees').select('id', { count: 'exact', head: true });
    if (error) {
      console.error('Error loading employee count:', error.message);
      setExistingEmployeesCount(null);
      return;
    }
    setExistingEmployeesCount(count ?? 0);
  };

  useEffect(() => {
    void fetchEmployeesCount();
  }, []);

  const resetMessages = () => {
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setPreviewRows([]);
    resetMessages();
  };

  const validateAndBuildRows = (rows: CsvRawRow[], fields: string[]) => {
    const normalizedFields = fields.map(normalizeHeader);
    const nameFieldIdx = normalizedFields.indexOf('name');
    const positionFieldIdx = normalizedFields.indexOf('position');

    if (nameFieldIdx === -1) {
      throw new Error(t.importRequiredName);
    }

    const nameKey = fields[nameFieldIdx];
    const positionKey = positionFieldIdx >= 0 ? fields[positionFieldIdx] : '';

    const validationErrors: string[] = [];
    const parsedRows: ParsedEmployeeRow[] = [];

    rows.forEach((rawRow, index) => {
      const name = getStringCell(rawRow, nameKey);
      const position = positionKey ? getStringCell(rawRow, positionKey) : '';
      const isEmptyRow = Object.values(rawRow).every((v) => String(v ?? '').trim() === '');

      if (isEmptyRow) return;
      if (!name) {
        validationErrors.push(`Zeile ${index + 2}: name fehlt.`);
        return;
      }

      parsedRows.push({ name, position });
    });

    if (validationErrors.length > 0) {
      throw new Error(`${t.importValidationErrorPrefix}\n${validationErrors.join('\n')}`);
    }

    if (parsedRows.length === 0) {
      throw new Error(t.importNoValidRows);
    }

    return parsedRows;
  };

  const handleUploadCsv = () => {
    resetMessages();
    if (!file) {
      setErrorMessage(t.importSelectFileFirst);
      return;
    }

    setUploading(true);
    Papa.parse<CsvRawRow>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (result) => {
        try {
          if (result.errors.length > 0) {
            const parseErrors = result.errors
              .map((err: ParseError) => `${err.message}${typeof err.row === 'number' ? ` (Zeile ${err.row + 1})` : ''}`)
              .join('\n');
            throw new Error(parseErrors || t.importParseFailed);
          }
          const fields = result.meta.fields ?? [];
          const rows = validateAndBuildRows(result.data, fields);
          setPreviewRows(rows);
          setSuccessMessage('');
        } catch (e: unknown) {
          setPreviewRows([]);
          setErrorMessage(e instanceof Error ? e.message : t.importParseFailed);
        } finally {
          setUploading(false);
        }
      },
      error: (e) => {
        setUploading(false);
        setPreviewRows([]);
        setErrorMessage(e.message || t.importParseFailed);
      },
    });
  };

  const handleImport = async () => {
    resetMessages();
    if (!hasPreview) {
      setErrorMessage(t.importNoValidRows);
      return;
    }

    setImporting(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;

      let companyId: string | null = null;
      if (user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('id', user.id)
          .maybeSingle();
        if (!profileError) {
          companyId = (profile?.company_id as string | null) ?? null;
        }
      }

      const insertPayload = previewRows.map((row) => ({
        name: row.name,
        ...(companyId ? { company_id: companyId } : {}),
      }));

      const { error } = await supabase.from('employees').insert(insertPayload);
      if (error) throw error;

      setSuccessMessage(t.importSuccess);
      setPreviewRows([]);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchEmployeesCount();
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : t.error);
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = t.importTemplateFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <AuthGuard>
      <Layout>
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{t.importTitle}</h1>
            <p className="mt-1 text-sm text-gray-600">{t.importSubtitle}</p>
          </div>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
              <div>
                <label htmlFor="import-file" className="mb-1 block text-sm font-medium text-gray-700">
                  {t.importSelectFile}
                </label>
                <input
                  id="import-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleUploadCsv}
                disabled={uploading || importing}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploading ? t.loading : t.importUploadCsv}
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={importDisabled}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
              >
                {importing ? t.loading : t.importDataButton}
              </button>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                {t.importDownloadTemplate}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-600">
              {existingEmployeesCount != null ? (
                <span>
                  {t.importExistingEmployees}: {existingEmployeesCount}
                </span>
              ) : null}
              {rowsReadyLabel ? <span>{rowsReadyLabel}</span> : null}
            </div>

            {errorMessage ? (
              <p className="mt-3 whitespace-pre-line text-sm text-red-600" role="alert">
                {errorMessage}
              </p>
            ) : null}
            {successMessage ? (
              <p className="mt-3 text-sm text-green-700" role="status">
                {successMessage}
              </p>
            ) : null}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t.importPreviewTitle}</h2>
              <p className="mt-1 text-xs text-gray-500">{t.importPreviewHint}</p>
            </div>

            {!hasPreview ? (
              <p className="text-sm text-gray-600">{t.importNoPreview}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {t.employeeName}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Position
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {previewRows.map((row, idx) => (
                      <tr key={`${row.name}-${idx}`}>
                        <td className="px-3 py-2 text-sm text-gray-800">{row.name}</td>
                        <td className="px-3 py-2 text-sm text-gray-700">{row.position || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </Layout>
    </AuthGuard>
  );
}
