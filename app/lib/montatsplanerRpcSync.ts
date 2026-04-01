import { supabase } from '@/lib/supabaseClient';
import type { MetricField, MonthKey, MonthPayload, PlannerData } from '@/components/montatsplaner/plannerTypes';
import { MONTH_KEYS, daysInMonth, round1, splitTotalAcrossDaysForMetric } from '@/components/montatsplaner/plannerTypes';
import { formatErrorMessage } from '@/lib/utils';
import { getEmployeeMonthlyHourTotals, type PlannerShiftAssignmentRow } from '@/lib/hoursCalculator';
import type { Vacation } from '@/types/database';

/** Embedded shift fields only — matches `hoursCalculator` needs; lighter than `shifts(*)`. */
const SHIFT_EMBED =
  'id,name,start_time,end_time,break_minutes';

const RPC_SYNC_MAX_ATTEMPTS = 3;
const FETCH_RETRY_MS = [400, 1200, 2500];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Browser / edge failures before a normal PostgREST JSON body (offline, DNS, CORS, blocked tab). */
function isTransientFetchFailure(err: unknown): boolean {
  const msg = formatErrorMessage(err).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('fetch failed')
  );
}

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
  if (employeeIds.length === 0) {
    const empty = {} as Record<MonthKey, Record<string, RpcHoursRow | null>>;
    for (const mk of MONTH_KEYS) empty[mk] = {};
    return empty;
  }

  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  let assignments: PlannerShiftAssignmentRow[] = [];
  let vacations: Vacation[] = [];
  for (let attempt = 0; attempt < RPC_SYNC_MAX_ATTEMPTS; attempt++) {
    const assignQ = supabase
      .from('shift_assignments')
      .select(
        `employee_id, date, assignment_type, custom_start_time, custom_end_time, custom_break_minutes, shift_id, store_id, shift:shifts(${SHIFT_EMBED})`
      )
      .gte('date', start)
      .lte('date', end)
      .in('employee_id', employeeIds);

    const vacQ = supabase
      .from('vacations')
      .select('*')
      .lte('start_date', end)
      .gte('end_date', start)
      .in('employee_id', employeeIds);

    const [assignRes, vacRes] = await Promise.all([assignQ, vacQ]);

    if (!assignRes.error && !vacRes.error) {
      assignments = (assignRes.data || []) as unknown as PlannerShiftAssignmentRow[];
      vacations = (vacRes.data || []) as Vacation[];
      break;
    }

    const err = assignRes.error ?? vacRes.error;
    const transient = isTransientFetchFailure(err);
    if (transient && attempt < RPC_SYNC_MAX_ATTEMPTS - 1) {
      await sleep(FETCH_RETRY_MS[attempt] ?? 800);
      continue;
    }

    const msg = formatErrorMessage(err);
    const hint = transient
      ? ' Check network, VPN, and NEXT_PUBLIC_SUPABASE_URL; ad blockers can block Supabase.'
      : '';
    console.error('shift_assignments / vacations load for planner sync', msg + hint, err);
    throw err;
  }

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
