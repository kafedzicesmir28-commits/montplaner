import { useCallback } from 'react';
import Papa, { ParseError } from 'papaparse';
import { ImportConfig, ParsedCsvRow } from '@/lib/import/types';

type ParseSuccess = {
  rows: ParsedCsvRow[];
  parseErrors: string[];
};

function normalizeCellValue(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeHeaders(headers: string[]) {
  return headers.map((h) => h.trim().toLowerCase());
}

function canonicalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

const FIELD_ALIASES: Record<string, string[]> = {
  break_minutes: ['break_min', 'break', 'pause_minutes', 'pause_min'],
  custom_break_minutes: ['custom_break', 'custom_break_min', 'custom_pause_minutes', 'custom_pause_min'],
  custom_start_time: ['custom_start', 'custom_sta', 'custom_startzeit'],
  custom_end_time: ['custom_end', 'custom_en', 'custom_endzeit'],
  assignment_type: ['assignment', 'assignmenttype', 'type'],
};

export function useCsvParser() {
  const parseCsv = useCallback((file: File, config: ImportConfig): Promise<ParseSuccess> => {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, unknown>>(file, {
        header: true,
        skipEmptyLines: 'greedy',
        complete: (result) => {
          const headers = result.meta.fields ?? [];
          const normalizedHeaders = normalizeHeaders(headers);
          const canonicalToHeader = new Map<string, string>();
          headers.forEach((header) => {
            canonicalToHeader.set(canonicalizeHeader(header), header);
          });
          const missingHeaders = config.requiredFields.filter((field) => {
            if (normalizedHeaders.includes(field.toLowerCase())) return false;
            return !canonicalToHeader.has(canonicalizeHeader(field));
          });

          if (missingHeaders.length > 0) {
            reject(new Error(`Missing CSV columns: ${missingHeaders.join(', ')}`));
            return;
          }

          const rows = result.data
            .map((raw) => {
              const normalized: ParsedCsvRow = {};
              config.fields.forEach((field) => {
                const i = normalizedHeaders.indexOf(field.toLowerCase());
                let sourceHeader = i >= 0 ? headers[i] : (canonicalToHeader.get(canonicalizeHeader(field)) ?? field);
                if (sourceHeader === field) {
                  const aliases = FIELD_ALIASES[field] ?? [];
                  for (const alias of aliases) {
                    const aliasHeader = canonicalToHeader.get(canonicalizeHeader(alias));
                    if (aliasHeader) {
                      sourceHeader = aliasHeader;
                      break;
                    }
                  }
                }
                normalized[field] = normalizeCellValue(raw[sourceHeader]);
              });
              return normalized;
            })
            .filter((row) => Object.values(row).some((v) => v !== ''));

          const parseErrors = result.errors.map((err: ParseError) => {
            const atRow = typeof err.row === 'number' ? ` (row ${err.row + 1})` : '';
            return `${err.message}${atRow}`;
          });

          resolve({ rows, parseErrors });
        },
        error: (error) => reject(error),
      });
    });
  }, []);

  return { parseCsv };
}
