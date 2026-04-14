import { useMemo } from 'react';
import { validateImportRows } from '@/lib/import/importValidators';
import { ImportType, ParsedCsvRow } from '@/lib/import/types';

export function useImportValidator(type: ImportType, rows: ParsedCsvRow[]) {
  return useMemo(() => validateImportRows(type, rows), [type, rows]);
}
