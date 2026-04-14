import { ImportType, ParsedCsvRow } from '@/lib/import/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toNullable(value: string | undefined) {
  const v = value?.trim() ?? '';
  const normalized = v.toLowerCase();
  if (!v || normalized === 'missing' || normalized === 'null' || normalized === 'n/a' || normalized === '-') {
    return null;
  }
  return v;
}

function toUuidOrNull(value: string | undefined) {
  const normalized = toNullable(value);
  if (!normalized) return null;
  return UUID_RE.test(normalized) ? normalized : null;
}

function toNumberOrNull(value: string | undefined) {
  const raw = toNullable(value);
  if (raw == null) return null;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function toBooleanOrNull(value: string | undefined) {
  const base = toNullable(value);
  const v = base?.toLowerCase() ?? '';
  if (!base) return null;
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return null;
}

function toSupabaseTime(value: string | undefined) {
  const rawValue = toNullable(value);
  if (!rawValue) return '';
  const raw = rawValue.trim();
  const replaced = raw.replace('.', ':');
  const match = replaced.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return raw;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return raw;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function toSupabaseTimeOrNull(value: string | undefined) {
  const raw = toSupabaseTime(value);
  return raw || null;
}

function toDateOrNull(value: string | undefined) {
  const rawValue = toNullable(value);
  if (!rawValue) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) return rawValue;

  const isoDateTime = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})[tT ]/);
  if (isoDateTime) return `${isoDateTime[1]}-${isoDateTime[2]}-${isoDateTime[3]}`;

  const dot = rawValue.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dot) {
    const dd = Number(dot[1]);
    const mm = Number(dot[2]);
    const yyyy = Number(dot[3]);
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }

  const slashDmy = rawValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
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

  const dash = rawValue.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
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

  const slashYmd = rawValue.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashYmd) {
    const yyyy = Number(slashYmd[1]);
    const mm = Number(slashYmd[2]);
    const dd = Number(slashYmd[3]);
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }

  const excelSerial = rawValue.match(/^\d{5}(\.\d+)?$/);
  if (excelSerial) {
    const days = Math.floor(Number(rawValue));
    if (Number.isFinite(days) && days > 0) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      excelEpoch.setUTCDate(excelEpoch.getUTCDate() + days);
      const y = excelEpoch.getUTCFullYear();
      const m = String(excelEpoch.getUTCMonth() + 1).padStart(2, '0');
      const d = String(excelEpoch.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  return null;
}

function toTimestampOrNull(value: string | undefined) {
  const rawValue = toNullable(value);
  if (!rawValue) return null;
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function mapRowsForInsert(type: ImportType, rows: ParsedCsvRow[], companyId: string | null) {
  if (type === 'employees') {
    return rows.map((row) => ({
      ...(toUuidOrNull(row.id) ? { id: toUuidOrNull(row.id) } : {}),
      name: row.name,
      employment_start_date: toDateOrNull(row.employment_start_date),
      birth_date: toDateOrNull(row.birth_date),
      is_active: toBooleanOrNull(row.is_active) ?? true,
      sort_order: toNumberOrNull(row.sort_order),
      hourly_rate: toNumberOrNull(row.hourly_rate),
      store_id: toNullable(row.store_id),
      ...((toUuidOrNull(row.company_id) ?? companyId) ? { company_id: toUuidOrNull(row.company_id) ?? companyId } : {}),
      ...(toTimestampOrNull(row.created_at) ? { created_at: toTimestampOrNull(row.created_at) } : {}),
    }));
  }

  if (type === 'stores') {
    return rows.map((row) => ({
      ...(toUuidOrNull(row.id) ? { id: toUuidOrNull(row.id) } : {}),
      name: row.name,
      color: toNullable(row.color),
      ...((toUuidOrNull(row.company_id) ?? companyId) ? { company_id: toUuidOrNull(row.company_id) ?? companyId } : {}),
    }));
  }

  if (type === 'shifts') {
    return rows.map((row) => ({
      ...(toUuidOrNull(row.id) ? { id: toUuidOrNull(row.id) } : {}),
      name: row.name,
      code: toNullable(row.code),
      start_time: toSupabaseTime(row.start_time),
      end_time: toSupabaseTime(row.end_time),
      break_minutes: toNumberOrNull(row.break_minutes) ?? 0,
      store_id: toNullable(row.store_id),
      is_global: toBooleanOrNull(row.is_global) ?? false,
      ...((toUuidOrNull(row.company_id) ?? companyId) ? { company_id: toUuidOrNull(row.company_id) ?? companyId } : {}),
    }));
  }

  if (type === 'shift_assignments') {
    return rows.map((row) => ({
      ...(toUuidOrNull(row.id) ? { id: toUuidOrNull(row.id) } : {}),
      employee_id: toUuidOrNull(row.employee_id),
      date: toDateOrNull(row.date),
      shift_id: toUuidOrNull(row.shift_id),
      store_id: toNullable(row.store_id),
      custom_start_time: toSupabaseTimeOrNull(row.custom_start_time),
      custom_end_time: toSupabaseTimeOrNull(row.custom_end_time),
      assignment_type: toNullable(row.assignment_type) ?? 'SHIFT',
      custom_break_minutes: toNumberOrNull(row.custom_break_minutes) ?? 0,
      ...((toUuidOrNull(row.company_id) ?? companyId) ? { company_id: toUuidOrNull(row.company_id) ?? companyId } : {}),
    }));
  }

  return rows.map((row) => ({
    employee_id: toUuidOrNull(row.employee_id),
    start_date: toDateOrNull(row.start_date),
    end_date: toDateOrNull(row.end_date),
    company_id: toUuidOrNull(row.company_id),
  }));
}
