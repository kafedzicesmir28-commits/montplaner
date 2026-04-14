import { importConfig } from '@/lib/import/importConfig';
import { ImportType, ParsedCsvRow, ValidationError } from '@/lib/import/types';

type ValidationResult = {
  validRows: ParsedCsvRow[];
  errors: ValidationError[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isMissingValue(value: string | undefined) {
  const v = value?.trim().toLowerCase() ?? '';
  return !v || v === 'missing' || v === 'null' || v === 'n/a' || v === '-';
}

function normalizeDate(value: string | undefined) {
  const raw = value?.trim() ?? '';
  if (!raw) return '';
  if (DATE_RE.test(raw)) return raw;

  const isoDateTime = raw.match(/^(\d{4})-(\d{2})-(\d{2})[tT ]/);
  if (isoDateTime) {
    return `${isoDateTime[1]}-${isoDateTime[2]}-${isoDateTime[3]}`;
  }

  const dot = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dot) {
    const dd = Number(dot[1]);
    const mm = Number(dot[2]);
    const yyyy = Number(dot[3]);
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }

  const slashDmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashDmy) {
    const first = Number(slashDmy[1]);
    const second = Number(slashDmy[2]);
    const yyyy = Number(slashDmy[3]);
    const useDmy = first > 12;
    const dd = useDmy ? first : second;
    const mm = useDmy ? second : first;
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }

  const dash = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) {
    const first = Number(dash[1]);
    const second = Number(dash[2]);
    const yyyy = Number(dash[3]);
    const useDmy = first > 12;
    const dd = useDmy ? first : second;
    const mm = useDmy ? second : first;
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }

  const slashYmd = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashYmd) {
    const yyyy = Number(slashYmd[1]);
    const mm = Number(slashYmd[2]);
    const dd = Number(slashYmd[3]);
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }

  const excelSerial = raw.match(/^\d{5}(\.\d+)?$/);
  if (excelSerial) {
    const days = Math.floor(Number(raw));
    if (Number.isFinite(days) && days > 0) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      excelEpoch.setUTCDate(excelEpoch.getUTCDate() + days);
      const y = excelEpoch.getUTCFullYear();
      const m = String(excelEpoch.getUTCMonth() + 1).padStart(2, '0');
      const d = String(excelEpoch.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  return raw;
}

function normalizeTime(value: string) {
  const raw = value.trim();
  if (!raw) return '';
  const replaced = raw.replace('.', ':');
  const match = replaced.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return raw;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return raw;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return raw;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function hasRequiredFields(type: ImportType, row: ParsedCsvRow, rowIndex: number): ValidationError[] {
  const required = importConfig[type].requiredFields;
  return required
    .filter((field) => isMissingValue(row[field]))
    .map((field) => ({
      rowIndex,
      reason: `Missing required field: ${field}`,
    }));
}

function validateByType(type: ImportType, row: ParsedCsvRow, rowIndex: number): ValidationError[] {
  if (type === 'employees') {
    const errs: ValidationError[] = [];
    const employmentStart = normalizeDate(row.employment_start_date);
    const birthDate = normalizeDate(row.birth_date);
    if (!isMissingValue(row.employment_start_date) && !DATE_RE.test(employmentStart)) {
      errs.push({ rowIndex, reason: 'employment_start_date must be YYYY-MM-DD' });
    }
    if (!isMissingValue(row.birth_date) && !DATE_RE.test(birthDate)) {
      errs.push({ rowIndex, reason: 'birth_date must be YYYY-MM-DD' });
    }
    if (!isMissingValue(row.sort_order) && Number.isNaN(Number(row.sort_order))) {
      errs.push({ rowIndex, reason: 'sort_order must be a number' });
    }
    if (!isMissingValue(row.hourly_rate) && Number.isNaN(Number(row.hourly_rate.replace(',', '.')))) {
      errs.push({ rowIndex, reason: 'hourly_rate must be a number' });
    }
    if (!isMissingValue(row.is_active)) {
      const v = row.is_active.trim().toLowerCase();
      const valid = ['true', 'false', '1', '0', 'yes', 'no'].includes(v);
      if (!valid) {
        errs.push({ rowIndex, reason: 'is_active must be true/false/1/0/yes/no' });
      }
    }
    return errs;
  }

  if (type === 'vacations') {
    const errs: ValidationError[] = [];
    const startDate = normalizeDate(row.start_date);
    const endDate = normalizeDate(row.end_date);
    if (!isMissingValue(row.start_date) && !DATE_RE.test(startDate)) {
      errs.push({ rowIndex, reason: 'start_date must be YYYY-MM-DD' });
    }
    if (!isMissingValue(row.end_date) && !DATE_RE.test(endDate)) {
      errs.push({ rowIndex, reason: 'end_date must be YYYY-MM-DD' });
    }
    if (!isMissingValue(row.start_date) && !isMissingValue(row.end_date) && endDate < startDate) {
      errs.push({ rowIndex, reason: 'end_date must be on/after start_date' });
    }
    if (!isMissingValue(row.company_id) && !UUID_RE.test(row.company_id.trim())) {
      errs.push({ rowIndex, reason: 'company_id must be a valid UUID' });
    }
    return errs;
  }

  if (type === 'shifts') {
    const errs: ValidationError[] = [];
    const start = normalizeTime(isMissingValue(row.start_time) ? '' : row.start_time ?? '');
    const end = normalizeTime(isMissingValue(row.end_time) ? '' : row.end_time ?? '');
    if (start && !TIME_RE.test(start)) {
      errs.push({ rowIndex, reason: 'start_time must be HH:mm' });
    }
    if (end && !TIME_RE.test(end)) {
      errs.push({ rowIndex, reason: 'end_time must be HH:mm' });
    }
    if (!isMissingValue(row.break_minutes) && Number.isNaN(Number(row.break_minutes))) {
      errs.push({ rowIndex, reason: 'break_minutes must be a number' });
    }
    return errs;
  }

  if (type === 'shift_assignments') {
    const errs: ValidationError[] = [];
    const assignmentDate = normalizeDate(row.date);
    const customStart = normalizeTime(isMissingValue(row.custom_start_time) ? '' : row.custom_start_time ?? '');
    const customEnd = normalizeTime(isMissingValue(row.custom_end_time) ? '' : row.custom_end_time ?? '');
    if (!isMissingValue(row.employee_id) && !UUID_RE.test(row.employee_id.trim())) {
      errs.push({ rowIndex, reason: 'employee_id must be a valid UUID' });
    }
    if (!isMissingValue(row.shift_id) && !UUID_RE.test(row.shift_id.trim())) {
      errs.push({ rowIndex, reason: 'shift_id must be a valid UUID' });
    }
    if (!isMissingValue(row.store_id) && !UUID_RE.test(row.store_id.trim())) {
      errs.push({ rowIndex, reason: 'store_id must be a valid UUID' });
    }
    if (!isMissingValue(row.date) && !DATE_RE.test(assignmentDate)) {
      errs.push({ rowIndex, reason: 'date must be YYYY-MM-DD' });
    }
    if (customStart && !TIME_RE.test(customStart)) {
      errs.push({ rowIndex, reason: 'custom_start_time must be HH:mm' });
    }
    if (customEnd && !TIME_RE.test(customEnd)) {
      errs.push({ rowIndex, reason: 'custom_end_time must be HH:mm' });
    }
    if (!isMissingValue(row.custom_break_minutes) && Number.isNaN(Number(row.custom_break_minutes))) {
      errs.push({ rowIndex, reason: 'custom_break_minutes must be a number' });
    }
    if (!isMissingValue(row.assignment_type)) {
      const t = row.assignment_type.trim().toUpperCase();
      const valid = ['SHIFT', 'FREI', 'KRANK', 'FERIEN'].includes(t);
      if (!valid) {
        errs.push({ rowIndex, reason: 'assignment_type must be SHIFT/FREI/KRANK/FERIEN' });
      }
    }
    return errs;
  }

  return [];
}

export function validateImportRows(type: ImportType, rows: ParsedCsvRow[]): ValidationResult {
  const errors: ValidationError[] = [];
  const validRows: ParsedCsvRow[] = [];

  rows.forEach((row, rowIndex) => {
    const requiredErrors = hasRequiredFields(type, row, rowIndex);
    const typeErrors = validateByType(type, row, rowIndex);
    const rowErrors = [...requiredErrors, ...typeErrors];
    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }
    validRows.push(row);
  });

  return { validRows, errors };
}
