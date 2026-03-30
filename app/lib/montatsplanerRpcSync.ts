import { supabase } from '@/lib/supabaseClient';
import type { MetricField, MonthKey, MonthPayload, PlannerData } from '@/components/montatsplaner/plannerTypes';
import { MONTH_KEYS, daysInMonth, round1, splitTotalAcrossDaysForMetric } from '@/components/montatsplaner/plannerTypes';
import { formatErrorMessage } from '@/lib/utils';
import { getEmployeeMonthlyHourTotals, type PlannerShiftAssignmentRow } from '@/lib/hoursCalculator';
import type { Vacation } from '@/types/database';

/** Month totals aligned with planner shift_assignments + vacations (same as Buchhaltung). */
export type RpcHoursRow = {
  normal_hours: number;
  night_hours: number;
  sunday_hours: number;
  vacation_days: number;
  sick_days: number;
  total_hours: number;
};

function rpcToMonthlyTotals(row: RpcHoursRow | null): Record<MetricField, number> {
  if (!row) {
    return { geleistete: 0, nacht: 0, sonntag: 0, krank: 0, ferien: 0 };
  }
  return {
    /** Effective worked hours only; night/Sunday are separate informational columns. */
    geleistete: Number(row.total_hours ?? 0),
    nacht: Number(row.night_hours ?? 0),
    sonntag: Number(row.sunday_hours ?? 0),
    krank: Number(row.sick_days ?? 0),
    ferien: Number(row.vacation_days ?? 0),
  };
}

/**
 * Writes planner-aligned month totals into per-day entries (even split) so Montatsplaner sums stay consistent.
 * Preserves remarks on day 1 when preserveBemerkung is true.
 */
export function applyRpcTotalsToMonthPayload(
  prev: MonthPayload | undefined,
  row: RpcHoursRow | null,
  year: number,
  monthIndex0: number,
  preserveBemerkung: boolean
): MonthPayload {
  const dim = daysInMonth(year, monthIndex0);
  const totals = rpcToMonthlyTotals(row);
  const metrics: MetricField[] = ['geleistete', 'nacht', 'sonntag', 'krank', 'ferien'];
  const splits: Record<MetricField, number[]> = {
    geleistete: [],
    nacht: [],
    sonntag: [],
    krank: [],
    ferien: [],
  };
  for (const m of metrics) {
    splits[m] = splitTotalAcrossDaysForMetric(totals[m], dim, m);
  }
  const bem =
    preserveBemerkung && prev?.days?.[1]?.bemerkung ? prev.days[1].bemerkung : '';

  const days: MonthPayload['days'] = {};
  for (let d = 1; d <= dim; d++) {
    const i = d - 1;
    days[d] = {
      hours: round1(splits.geleistete[i] ?? 0),
      nacht: round1(splits.nacht[i] ?? 0),
      sonntag: round1(splits.sonntag[i] ?? 0),
      krankheit: round1(splits.krank[i] ?? 0),
      ferien: round1(splits.ferien[i] ?? 0),
      bemerkung: d === 1 ? bem : '',
    };
  }
  return { days };
}

/** Loads computed hours for every employee and calendar month from planner data (single source of truth). */
export async function fetchRpcHoursForYear(
  year: number,
  employeeIds: string[]
): Promise<Record<MonthKey, Record<string, RpcHoursRow | null>>> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const [assignRes, vacRes] = await Promise.all([
    supabase
      .from('shift_assignments')
      .select('employee_id, date, assignment_type, custom_start_time, custom_end_time, custom_break_minutes, shift_id, store_id, shift:shifts(*)')
      .gte('date', start)
      .lte('date', end),
    supabase.from('vacations').select('*').lte('start_date', end).gte('end_date', start),
  ]);

  if (assignRes.error) {
    const msg = formatErrorMessage(assignRes.error);
    console.error('shift_assignments load for planner sync', msg, assignRes.error);
    throw assignRes.error;
  }
  if (vacRes.error) {
    const msg = formatErrorMessage(vacRes.error);
    console.error('vacations load for planner sync', msg, vacRes.error);
    throw vacRes.error;
  }

  const assignments = (assignRes.data || []) as unknown as PlannerShiftAssignmentRow[];
  const vacations = (vacRes.data || []) as Vacation[];

  const out = {} as Record<MonthKey, Record<string, RpcHoursRow | null>>;

  for (let m = 0; m < 12; m++) {
    const mk = MONTH_KEYS[m];
    const pMonth = `${year}-${String(m + 1).padStart(2, '0')}-01`;
    const byEmp: Record<string, RpcHoursRow | null> = {};
    for (const empId of employeeIds) {
      byEmp[empId] = getEmployeeMonthlyHourTotals(empId, pMonth, assignments, vacations);
    }
    out[mk] = byEmp;
  }

  return out;
}

export function applyRpcYearToPlannerData(
  base: PlannerData,
  rpc: Record<MonthKey, Record<string, RpcHoursRow | null>>,
  employeeIds: string[],
  preserveBemerkung: boolean
): PlannerData {
  const next: PlannerData = { year: base.year, months: { ...base.months } };

  for (let m = 0; m < 12; m++) {
    const mk = MONTH_KEYS[m];
    const byEmp = { ...(next.months[mk] ?? {}) };
    for (const empId of employeeIds) {
      const prev = base.months[mk]?.[empId];
      const rpcRow = rpc[mk]?.[empId] ?? null;
      byEmp[empId] = applyRpcTotalsToMonthPayload(prev, rpcRow, base.year, m, preserveBemerkung);
    }
    next.months[mk] = byEmp;
  }

  return next;
}
