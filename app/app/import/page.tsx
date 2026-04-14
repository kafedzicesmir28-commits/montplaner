'use client';

import { useMemo, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import CsvPreviewTable from '@/components/import/CsvPreviewTable';
import CsvUploader from '@/components/import/CsvUploader';
import { useCsvParser } from '@/components/import/useCsvParser';
import { useImportValidator } from '@/components/import/useImportValidator';
import { importConfig, importTypeOrder } from '@/lib/import/importConfig';
import { mapRowsForInsert } from '@/lib/import/importMapper';
import { ImportType, ParsedCsvRow } from '@/lib/import/types';
import { supabase } from '@/lib/supabaseClient';

export default function ImportPage() {
  const { parseCsv } = useCsvParser();
  const [selectedType, setSelectedType] = useState<ImportType>('employees');
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<ParsedCsvRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [failedRows, setFailedRows] = useState<Array<{ row: ParsedCsvRow; reason: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const config = importConfig[selectedType];
  const { validRows, errors } = useImportValidator(selectedType, previewRows);
  const hasPreview = previewRows.length > 0;
  const importDisabled = importing || uploading || !hasPreview || validRows.length === 0;

  const rowsReadyLabel = useMemo(() => {
    if (!hasPreview) return '';
    return `${validRows.length} rows valid, ${errors.length} errors`;
  }, [errors.length, hasPreview, validRows.length]);

  const resetMessages = () => {
    setErrorMessage('');
    setSuccessMessage('');
    setFailedRows([]);
  };

  const handleFileChange = (nextFile: File | null) => {
    setFile(nextFile);
    setPreviewRows([]);
    resetMessages();
  };

  const handleUploadCsv = async () => {
    resetMessages();
    if (!file) {
      setErrorMessage('Please select a CSV file first.');
      return;
    }

    setUploading(true);
    try {
      const { rows, parseErrors } = await parseCsv(file, config);
      if (parseErrors.length > 0) {
        setErrorMessage(parseErrors.join('\n'));
      }
      setPreviewRows(rows);
      if (rows.length === 0) {
        setErrorMessage('No valid rows found in CSV.');
      }
    } catch (e: unknown) {
      setPreviewRows([]);
      setErrorMessage(e instanceof Error ? e.message : 'CSV parse failed.');
    } finally {
      setUploading(false);
    }
  };

  const fetchExistingNames = async (tableName: 'employees' | 'stores') => {
    const names = new Set<string>();
    let from = 0;
    const size = 1000;
    while (true) {
      const { data, error } = await supabase
        .from(tableName)
        .select('name')
        .order('name', { ascending: true })
        .range(from, from + size - 1);
      if (error) throw error;
      const batch = (data ?? []) as Array<{ name: string }>;
      batch.forEach((r) => names.add(r.name.trim().toLowerCase()));
      if (batch.length < size) break;
      from += size;
    }
    return names;
  };

  const normalizeUuidLike = (value: string) => {
    const raw = value.trim().toLowerCase();
    if (!raw) return null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(raw)) {
      return raw;
    }
    const compact = raw.replace(/[^0-9a-f]/g, '');
    if (!/^[0-9a-f]{32}$/.test(compact)) return null;
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
  };

  const fetchStoreLookup = async () => {
    const byId = new Set<string>();
    const byName = new Map<string, string>();
    let from = 0;
    const size = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('stores')
        .select('id, name')
        .order('name', { ascending: true })
        .range(from, from + size - 1);
      if (error) throw error;
      const batch = (data ?? []) as Array<{ id: string; name: string | null }>;
      batch.forEach((r) => {
        byId.add(r.id.toLowerCase());
        const nameKey = (r.name ?? '').trim().toLowerCase();
        if (nameKey) {
          byName.set(nameKey, r.id);
        }
      });
      if (batch.length < size) break;
      from += size;
    }
    return { byId, byName };
  };

  const fetchExistingCompanyIds = async () => {
    const ids = new Set<string>();
    let from = 0;
    const size = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('companies')
        .select('id')
        .order('id', { ascending: true })
        .range(from, from + size - 1);
      if (error) throw error;
      const batch = (data ?? []) as Array<{ id: string }>;
      batch.forEach((r) => ids.add(r.id.toLowerCase()));
      if (batch.length < size) break;
      from += size;
    }
    return ids;
  };

  const filterDuplicatesIfNeeded = async (rows: ParsedCsvRow[]) => {
    if (!skipDuplicates) return rows;
    if (selectedType !== 'employees' && selectedType !== 'stores') return rows;

    const existing = await fetchExistingNames(selectedType);
    const deduped: ParsedCsvRow[] = [];
    rows.forEach((row) => {
      const key = (row.name ?? '').trim().toLowerCase();
      if (!key || existing.has(key)) return;
      existing.add(key);
      deduped.push(row);
    });
    return deduped;
  };

  const handleImportRows = async (rows: ParsedCsvRow[]) => {
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

    const filteredRows = await filterDuplicatesIfNeeded(rows);
    const mappedRows = mapRowsForInsert(selectedType, filteredRows, companyId);
    if (selectedType === 'employees' || selectedType === 'stores' || selectedType === 'vacations' || selectedType === 'shifts' || selectedType === 'shift_assignments') {
      const existingCompanyIds = await fetchExistingCompanyIds();
      mappedRows.forEach((row) => {
        const companyValue = (row as { company_id?: string | null }).company_id?.trim() ?? null;
        if (!companyValue) {
          (row as { company_id?: string | null }).company_id = companyId;
          return;
        }
        if (existingCompanyIds.has(companyValue.toLowerCase())) return;
        (row as { company_id?: string | null }).company_id = companyId;
      });
    }

    if (selectedType === 'employees' || selectedType === 'shifts' || selectedType === 'shift_assignments') {
      const storeLookup = await fetchStoreLookup();
      mappedRows.forEach((row) => {
        const value = (row as { store_id?: string | null }).store_id?.trim() ?? '';
        if (!value) {
          (row as { store_id?: string | null }).store_id = null;
          return;
        }

        const normalizedUuid = normalizeUuidLike(value);
        if (normalizedUuid && storeLookup.byId.has(normalizedUuid)) {
          (row as { store_id?: string | null }).store_id = normalizedUuid;
          return;
        }

        const byName = storeLookup.byName.get(value.toLowerCase());
        if (byName) {
          (row as { store_id?: string | null }).store_id = byName;
          return;
        }

        (row as { store_id?: string | null }).store_id = null;
      });
    }

    if (selectedType === 'shift_assignments') {
      const employeeIds = new Set<string>();
      const shiftIds = new Set<string>();
      let from = 0;
      const size = 1000;
      while (true) {
        const [{ data: employeeBatch, error: employeeError }, { data: shiftBatch, error: shiftError }] = await Promise.all([
          supabase.from('employees').select('id').order('id', { ascending: true }).range(from, from + size - 1),
          supabase.from('shifts').select('id').order('id', { ascending: true }).range(from, from + size - 1),
        ]);
        if (employeeError) throw employeeError;
        if (shiftError) throw shiftError;
        (employeeBatch ?? []).forEach((r) => employeeIds.add((r as { id: string }).id.toLowerCase()));
        (shiftBatch ?? []).forEach((r) => shiftIds.add((r as { id: string }).id.toLowerCase()));
        if ((employeeBatch ?? []).length < size && (shiftBatch ?? []).length < size) break;
        from += size;
      }
      mappedRows.forEach((row) => {
        const employeeId = (row as { employee_id?: string | null }).employee_id?.toLowerCase() ?? '';
        const shiftId = (row as { shift_id?: string | null }).shift_id?.toLowerCase() ?? '';
        if (!employeeId || !employeeIds.has(employeeId)) {
          (row as { employee_id?: string | null }).employee_id = null;
        }
        if (shiftId && !shiftIds.has(shiftId)) {
          (row as { shift_id?: string | null }).shift_id = null;
        }
      });
    }
    if (mappedRows.length === 0) {
      return { inserted: 0, failed: rows.map((row) => ({ row, reason: 'Skipped as duplicate' })) };
    }

    const batchSize = 500;
    let inserted = 0;
    const failed: Array<{ row: ParsedCsvRow; reason: string }> = [];

    const isConflictError = (error: { code?: string; message?: string } | null) => {
      if (!error) return false;
      const code = error.code ?? '';
      const message = (error.message ?? '').toLowerCase();
      return code === '23505' || message.includes('duplicate key') || message.includes('conflict');
    };

    const persistEmployeeRow = async (payloadRow: Record<string, unknown>) => {
      const rowId = typeof payloadRow.id === 'string' ? payloadRow.id : null;
      const rowName = typeof payloadRow.name === 'string' ? payloadRow.name.trim() : '';
      const updatePayload = { ...payloadRow };
      delete (updatePayload as { id?: unknown }).id;

      if (rowId) {
        const { data: byId, error: updateByIdError } = await supabase
          .from('employees')
          .update(updatePayload)
          .eq('id', rowId)
          .select('id')
          .limit(1);
        if (updateByIdError) return updateByIdError;
        if ((byId ?? []).length > 0) return null;
      }

      if (rowName) {
        let updateByNameQuery = supabase
          .from('employees')
          .update(updatePayload)
          .eq('name', rowName)
          .select('id')
          .limit(1);
        if (companyId) {
          updateByNameQuery = updateByNameQuery.eq('company_id', companyId);
        }
        const { data: byName, error: updateByNameError } = await updateByNameQuery;
        if (updateByNameError) return updateByNameError;
        if ((byName ?? []).length > 0) return null;
      }

      const { error: insertError } = await supabase.from('employees').insert(payloadRow);
      if (!insertError) return null;

      if (rowId && isConflictError(insertError as { code?: string; message?: string })) {
        // Fallback: keep all other imported fields but let target DB generate a fresh id.
        const insertWithoutIdPayload = { ...payloadRow };
        delete (insertWithoutIdPayload as { id?: unknown }).id;
        const { error: insertWithoutIdError } = await supabase.from('employees').insert(insertWithoutIdPayload);
        if (!insertWithoutIdError) return null;
      }

      // If insert conflicts with an existing row, try one more update pass.
      if (rowId) {
        const { data: byIdAfterInsert, error: updateByIdAfterInsertError } = await supabase
          .from('employees')
          .update(updatePayload)
          .eq('id', rowId)
          .select('id')
          .limit(1);
        if (updateByIdAfterInsertError) return updateByIdAfterInsertError;
        if ((byIdAfterInsert ?? []).length > 0) return null;
      }
      if (rowName) {
        let updateByNameAfterInsertQuery = supabase
          .from('employees')
          .update(updatePayload)
          .eq('name', rowName)
          .select('id')
          .limit(1);
        if (companyId) {
          updateByNameAfterInsertQuery = updateByNameAfterInsertQuery.eq('company_id', companyId);
        }
        const { data: byNameAfterInsert, error: updateByNameAfterInsertError } = await updateByNameAfterInsertQuery;
        if (updateByNameAfterInsertError) return updateByNameAfterInsertError;
        if ((byNameAfterInsert ?? []).length > 0) return null;
      }

      return insertError;
    };

    const persistStoreRow = async (payloadRow: Record<string, unknown>) => {
      const rowId = typeof payloadRow.id === 'string' ? payloadRow.id : null;
      const rowName = typeof payloadRow.name === 'string' ? payloadRow.name.trim() : '';
      const updatePayload = { ...payloadRow };
      delete (updatePayload as { id?: unknown }).id;

      if (rowId) {
        const { data: byId, error: updateByIdError } = await supabase
          .from('stores')
          .update(updatePayload)
          .eq('id', rowId)
          .select('id')
          .limit(1);
        if (updateByIdError) return updateByIdError;
        if ((byId ?? []).length > 0) return null;
      }

      if (rowName) {
        let updateByNameQuery = supabase
          .from('stores')
          .update(updatePayload)
          .eq('name', rowName)
          .select('id')
          .limit(1);
        if (companyId) {
          updateByNameQuery = updateByNameQuery.eq('company_id', companyId);
        }
        const { data: byName, error: updateByNameError } = await updateByNameQuery;
        if (updateByNameError) return updateByNameError;
        if ((byName ?? []).length > 0) return null;
      }

      const { error: insertError } = await supabase.from('stores').insert(payloadRow);
      return insertError;
    };

    const persistShiftAssignmentRow = async (payloadRow: Record<string, unknown>) => {
      const employeeId = typeof payloadRow.employee_id === 'string' ? payloadRow.employee_id : null;
      const date = typeof payloadRow.date === 'string' ? payloadRow.date : null;
      const rowId = typeof payloadRow.id === 'string' ? payloadRow.id : null;

      if (!employeeId || !date) {
        return { message: 'employee_id and date are required for shift assignments' };
      }

      const updatePayload = { ...payloadRow };
      delete (updatePayload as { id?: unknown }).id;

      if (rowId) {
        const { data: byId, error: updateByIdError } = await supabase
          .from('shift_assignments')
          .update(updatePayload)
          .eq('id', rowId)
          .select('id')
          .limit(1);
        if (updateByIdError) return updateByIdError;
        if ((byId ?? []).length > 0) return null;
      }

      const { data: byEmployeeDate, error: updateByEmployeeDateError } = await supabase
        .from('shift_assignments')
        .update(updatePayload)
        .eq('employee_id', employeeId)
        .eq('date', date)
        .select('id')
        .limit(1);
      if (updateByEmployeeDateError) return updateByEmployeeDateError;
      if ((byEmployeeDate ?? []).length > 0) return null;

      const { error: insertError } = await supabase.from('shift_assignments').insert(payloadRow);
      return insertError;
    };

    for (let start = 0; start < mappedRows.length; start += batchSize) {
      const end = Math.min(start + batchSize, mappedRows.length);
      const payload = mappedRows.slice(start, end);
      const sourceRows = filteredRows.slice(start, end);

      if (selectedType === 'employees') {
        for (let i = 0; i < payload.length; i += 1) {
          const rowError = await persistEmployeeRow(payload[i] as Record<string, unknown>);
          if (rowError) {
            failed.push({ row: sourceRows[i], reason: rowError.message });
          } else {
            inserted += 1;
          }
        }
        continue;
      }

      if (selectedType === 'stores') {
        for (let i = 0; i < payload.length; i += 1) {
          const rowError = await persistStoreRow(payload[i] as Record<string, unknown>);
          if (rowError) {
            failed.push({ row: sourceRows[i], reason: rowError.message });
          } else {
            inserted += 1;
          }
        }
        continue;
      }

      if (selectedType === 'shift_assignments') {
        for (let i = 0; i < payload.length; i += 1) {
          const rowError = await persistShiftAssignmentRow(payload[i] as Record<string, unknown>);
          if (rowError) {
            failed.push({ row: sourceRows[i], reason: rowError.message });
          } else {
            inserted += 1;
          }
        }
        continue;
      }

      const { error } = await supabase.from(config.table).insert(payload);
      if (error) {
        // Fall back to row-by-row insert so one invalid row does not block the whole batch.
        for (let i = 0; i < payload.length; i += 1) {
          const { error: rowError } = await supabase.from(config.table).insert(payload[i]);
          if (rowError) {
            failed.push({ row: sourceRows[i], reason: rowError.message });
          } else {
            inserted += 1;
          }
        }
        continue;
      }
      inserted += payload.length;
    }

    return { inserted, failed };
  };

  const handleImport = async () => {
    resetMessages();
    if (!hasPreview) {
      setErrorMessage('No preview rows available.');
      return;
    }
    if (validRows.length === 0) {
      setErrorMessage('Fix validation errors before import.');
      return;
    }

    setImporting(true);
    try {
      const { inserted, failed } = await handleImportRows(validRows);
      setFailedRows(failed);
      setSuccessMessage(`Inserted ${inserted} row(s) into ${config.table}.`);
      if (failed.length === 0) {
        setPreviewRows([]);
        setFile(null);
      }
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const handleRetryFailed = async () => {
    if (failedRows.length === 0) return;
    setPreviewRows(failedRows.map((f) => f.row));
    setFailedRows([]);
    setSuccessMessage('Loaded failed rows back into preview. Fix source CSV if needed and re-import.');
  };

  const handleDownloadTemplate = () => {
    const header = config.fields.join(',');
    const sample = config.templateRows.map((row) => row.join(',')).join('\n');
    const csv = `${header}\n${sample}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedType}-template.csv`;
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
            <h1 className="text-2xl font-semibold text-gray-900">Universal CSV Import</h1>
            <p className="mt-1 text-sm text-gray-600">
              Upload, preview, validate, and import data safely without affecting existing workflows.
            </p>
          </div>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 grid gap-4 md:grid-cols-[1fr_auto]">
              <div>
                <label htmlFor="import-type" className="mb-1 block text-sm font-medium text-gray-700">
                  Select import type
                </label>
                <select
                  id="import-type"
                  value={selectedType}
                  onChange={(e) => {
                    setSelectedType(e.target.value as ImportType);
                    setFile(null);
                    setPreviewRows([]);
                    resetMessages();
                    setSkipDuplicates(e.target.value === 'employees');
                  }}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  {importTypeOrder.map((type) => (
                    <option key={type} value={type}>
                      {importConfig[type].label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="inline-flex items-center gap-2 self-end text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Skip duplicates
              </label>
            </div>

            <CsvUploader
              selectedTypeLabel={config.label}
              uploading={uploading}
              importing={importing}
              onFileChange={handleFileChange}
              onUpload={handleUploadCsv}
              onImport={handleImport}
              onDownloadTemplate={handleDownloadTemplate}
              importDisabled={importDisabled}
            />

            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-600">
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
            {failedRows.length > 0 ? (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm text-amber-800">
                  {failedRows.length} row(s) failed import. You can retry those rows.
                </p>
                <ul className="mt-2 list-inside list-disc text-xs text-amber-900">
                  {failedRows.slice(0, 5).map((item, idx) => (
                    <li key={`${idx}-${item.row.name ?? 'row'}`}>{item.reason}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => void handleRetryFailed()}
                  className="mt-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100"
                >
                  Retry failed rows
                </button>
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Preview before import</h2>
              <p className="mt-1 text-xs text-gray-500">Rows with validation errors are highlighted in red.</p>
            </div>
            <CsvPreviewTable columns={config.fields} rows={previewRows} errors={errors} limit={50} />
            {errors.length > 0 ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-medium text-red-700">Validation errors</p>
                <ul className="mt-1 list-inside list-disc text-sm text-red-700">
                  {errors.slice(0, 20).map((error, idx) => (
                    <li key={`${error.rowIndex}-${idx}`}>
                      Row {error.rowIndex + 2}: {error.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </div>
      </Layout>
    </AuthGuard>
  );
}
