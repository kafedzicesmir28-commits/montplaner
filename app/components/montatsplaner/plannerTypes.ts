/** Month keys match required plannerData shape (lowercase German names). */
export const MONTH_KEYS = [
  'januar',
  'februar',
  'märz',
  'april',
  'mai',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'dezember',
] as const;

export type MonthKey = (typeof MONTH_KEYS)[number];

export function monthIndexFromKey(monthKey: MonthKey): number {
  return MONTH_KEYS.indexOf(monthKey);
}

/** One calendar day — independent values (per employee, per month). */
export type DayEntry = {
  hours: number;
  nacht: number;
  sonntag: number;
  krankheit: number;
  ferien: number;
  bemerkung: string;
};

export type MonthPayload = {
  days: Record<number, DayEntry>;
};

/**
 * plannerData.year + months[monthKey][employeeId].days[dayNumber]
 * (extends the spec with employeeId so the existing employee-column layout stays valid.)
 */
export type PlannerData = {
  year: number;
  months: Record<MonthKey, Record<string, MonthPayload>>;
};

export type MetricField = 'geleistete' | 'nacht' | 'sonntag' | 'krank' | 'ferien';

export function emptyDay(): DayEntry {
  return {
    hours: 0,
    nacht: 0,
    sonntag: 0,
    krankheit: 0,
    ferien: 0,
    bemerkung: '',
  };
}

export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Clamp to ≥0, max 24 per day; monthly total cap for one metric = 24 * dim. */
export function clampMonthlyTotal(raw: number, dim: number): number {
  const cap = 24 * dim;
  const v = Number.isFinite(raw) ? raw : 0;
  return round1(Math.max(0, Math.min(cap, v)));
}

/** Hours-like metrics cap at 24h per day; day-count metrics cap at one unit per calendar day. */
export function clampMonthlyTotalForMetric(metric: MetricField, raw: number, dim: number): number {
  const v = Number.isFinite(raw) ? raw : 0;
  if (dim <= 0) return 0;
  if (metric === 'krank' || metric === 'ferien') {
    return round1(Math.max(0, Math.min(dim, v)));
  }
  return clampMonthlyTotal(v, dim);
}

/** Distribute a monthly total evenly across days; last day absorbs rounding. */
export function splitTotalAcrossDays(total: number, dim: number): number[] {
  const t = clampMonthlyTotal(total, dim);
  if (dim <= 0) return [];
  if (dim === 1) return [round1(t)];
  const base = Math.floor((t * 10) / dim) / 10;
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < dim - 1; i++) {
    const v = round1(base);
    out.push(v);
    sum += v;
  }
  out.push(round1(t - sum));
  return out;
}

export function splitTotalAcrossDaysForMetric(total: number, dim: number, metric: MetricField): number[] {
  const t = clampMonthlyTotalForMetric(metric, total, dim);
  if (dim <= 0) return [];
  if (dim === 1) return [round1(t)];
  const base = Math.floor((t * 10) / dim) / 10;
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < dim - 1; i++) {
    const v = round1(base);
    out.push(v);
    sum += v;
  }
  out.push(round1(t - sum));
  return out;
}

export function metricToDayKey(metric: MetricField): keyof DayEntry {
  switch (metric) {
    case 'geleistete':
      return 'hours';
    case 'nacht':
      return 'nacht';
    case 'sonntag':
      return 'sonntag';
    case 'krank':
      return 'krankheit';
    case 'ferien':
      return 'ferien';
  }
}

export function sumMetricForMonth(payload: MonthPayload | undefined, metric: MetricField): number {
  if (!payload?.days) return 0;
  const key = metricToDayKey(metric);
  let s = 0;
  for (const d of Object.keys(payload.days)) {
    const entry = payload.days[Number(d)];
    if (!entry) continue;
    s += Number(entry[key] ?? 0);
  }
  return round1(s);
}

/** Bemerkung is edited on day 1; display uses that cell only. */
export function getMonthBemerkung(payload: MonthPayload | undefined): string {
  return payload?.days?.[1]?.bemerkung ?? '';
}

export function sumBemerkungYear(
  data: PlannerData,
  empId: string,
  monthKeys: readonly MonthKey[]
): string {
  const parts: string[] = [];
  for (const mk of monthKeys) {
    const b = getMonthBemerkung(data.months[mk]?.[empId]);
    if (b.trim()) parts.push(b.trim());
  }
  return parts.join(' | ');
}

export function createEmptyMonthPayload(year: number, monthIndex0: number): MonthPayload {
  const dim = daysInMonth(year, monthIndex0);
  const days: Record<number, DayEntry> = {};
  for (let d = 1; d <= dim; d++) {
    days[d] = emptyDay();
  }
  return { days };
}

export function createEmptyPlannerData(year: number, employeeIds: string[]): PlannerData {
  const months = {} as Record<MonthKey, Record<string, MonthPayload>>;
  for (let m = 0; m < 12; m++) {
    const mk = MONTH_KEYS[m];
    const byEmp: Record<string, MonthPayload> = {};
    for (const id of employeeIds) {
      byEmp[id] = createEmptyMonthPayload(year, m);
    }
    months[mk] = byEmp;
  }
  return { year, months };
}

const STORAGE_PREFIX = 'montatsplaner_planner_v1_';

export function storageKeyForYear(year: number): string {
  return `${STORAGE_PREFIX}${year}`;
}

export function loadPlannerFromStorage(year: number): PlannerData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKeyForYear(year));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlannerData;
    if (!parsed || typeof parsed.year !== 'number' || !parsed.months) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePlannerToStorage(data: PlannerData): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKeyForYear(data.year), JSON.stringify(data));
  } catch {
    // ignore quota
  }
}

/** Merge saved data with current year + employee ids (add missing, keep existing). */
export function mergePlannerData(
  baseYear: number,
  employeeIds: string[],
  saved: PlannerData | null
): PlannerData {
  const fresh = createEmptyPlannerData(baseYear, employeeIds);
  if (!saved || saved.year !== baseYear) return fresh;

  for (let m = 0; m < 12; m++) {
    const mk = MONTH_KEYS[m];
    const dim = daysInMonth(baseYear, m);
    for (const empId of employeeIds) {
      const prev = saved.months[mk]?.[empId];
      if (!prev?.days) continue;
      const nextDays: Record<number, DayEntry> = { ...fresh.months[mk][empId].days };
      for (let d = 1; d <= dim; d++) {
        const old = prev.days[d];
        if (old) {
          nextDays[d] = {
            ...emptyDay(),
            ...old,
            hours: round1(Number(old.hours) || 0),
            nacht: round1(Number(old.nacht) || 0),
            sonntag: round1(Number(old.sonntag) || 0),
            krankheit: round1(Number(old.krankheit) || 0),
            ferien: round1(Number(old.ferien) || 0),
            bemerkung: typeof old.bemerkung === 'string' ? old.bemerkung : '',
          };
        }
      }
      fresh.months[mk][empId] = { days: nextDays };
    }
  }
  return fresh;
}
