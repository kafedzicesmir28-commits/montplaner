import { supabase } from '@/lib/supabaseClient';
import type { MetricField, MonthKey, MonthPayload, PlannerData } from '@/components/montatsplaner/plannerTypes';
import { MONTH_KEYS, daysInMonth, round1, splitTotalAcrossDaysForMetric } from '@/components/montatsplaner/plannerTypes';
import { formatErrorMessage } from '@/lib/utils';

/** Single row from `calculate_employee_hours` (shift_assignments + vacations + sick detection). */
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
    geleistete: Number(row.total_hours ?? 0),
    nacht: Number(row.night_hours ?? 0),
    sonntag: Number(row.sunday_hours ?? 0),
    krank: Number(row.sick_days ?? 0),
    ferien: Number(row.vacation_days ?? 0),
  };
}

/**
 * Writes RPC month totals into per-day entries (even split) so Montatsplaner sums stay consistent.
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

/** Loads computed hours for every employee and calendar month (planner + vacations protocol in SQL). */
export async function fetchRpcHoursForYear(
  year: number,
  employeeIds: string[]
): Promise<Record<MonthKey, Record<string, RpcHoursRow | null>>> {
  const monthBlocks = await Promise.all(
    MONTH_KEYS.map(async (mk, m) => {
      const pMonth = `${year}-${String(m + 1).padStart(2, '0')}-01`;
      const results = await Promise.all(
        employeeIds.map((empId) =>
          supabase.rpc('calculate_employee_hours', {
            p_employee_id: empId,
            p_month: pMonth,
          })
        )
      );
      const byEmp: Record<string, RpcHoursRow | null> = {};
      employeeIds.forEach((empId, idx) => {
        const res = results[idx];
        if (res.error) {
          const msg = formatErrorMessage(res.error);
          console.error('calculate_employee_hours', empId, pMonth, msg, {
            code: (res.error as { code?: string })?.code,
            details: (res.error as { details?: string })?.details,
            hint: (res.error as { hint?: string })?.hint,
          });
          byEmp[empId] = null;
        } else {
          const row = res.data?.[0] as RpcHoursRow | undefined;
          byEmp[empId] = row ?? null;
        }
      });
      return { mk, byEmp };
    })
  );

  const out = {} as Record<MonthKey, Record<string, RpcHoursRow | null>>;
  for (const { mk, byEmp } of monthBlocks) {
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
