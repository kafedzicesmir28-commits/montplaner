export type ImportType = 'employees' | 'stores' | 'shifts' | 'vacations' | 'shift_assignments';

export type ParsedCsvRow = Record<string, string>;

export type ValidationError = {
  rowIndex: number;
  reason: string;
};

export type ImportConfig = {
  type: ImportType;
  label: string;
  table: 'employees' | 'stores' | 'shifts' | 'vacations' | 'shift_assignments';
  fields: string[];
  requiredFields: string[];
  duplicateKey?: string;
  templateRows: string[][];
};
