'use client';

import { ParsedCsvRow, ValidationError } from '@/lib/import/types';

type CsvPreviewTableProps = {
  columns: string[];
  rows: ParsedCsvRow[];
  errors: ValidationError[];
  limit?: number;
};

function errorSetForRow(errors: ValidationError[]) {
  const set = new Set<number>();
  errors.forEach((e) => set.add(e.rowIndex));
  return set;
}

export default function CsvPreviewTable({ columns, rows, errors, limit = 25 }: CsvPreviewTableProps) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-600">No preview rows yet.</p>;
  }

  const invalidRows = errorSetForRow(errors);
  const slice = rows.slice(0, limit);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {slice.map((row, rowIndex) => {
              const invalid = invalidRows.has(rowIndex);
              return (
                <tr key={`row-${rowIndex}`} className={invalid ? 'bg-red-50' : ''}>
                  {columns.map((column) => (
                    <td key={`${rowIndex}-${column}`} className="px-3 py-2 text-sm text-gray-800">
                      {row[column] || <span className="text-gray-400">-</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > limit ? (
        <p className="text-xs text-gray-500">
          Showing first {limit} rows of {rows.length}.
        </p>
      ) : null}
    </div>
  );
}
