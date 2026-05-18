'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabaseClient';
import type { Employee, Shift, ShiftAssignment, Store, Vacation } from '@/types/database';
import {
  assignmentHourBuckets,
  calculateEmployeeHours,
  getEmployeeMonthlyHourTotals,
  isKrankShiftName,
  type PlannerShiftAssignmentRow,
} from '@/lib/hoursCalculator';
import { PLANNER_ASSIGNMENTS_CHANGED } from '@/lib/plannerEvents';
import {
  formatDate,
  formatErrorMessage,
  formatWorkHoursDisplay,
  getDaysInMonth,
  isDateInVacation,
} from '@/lib/utils';

type AssignmentRow = ShiftAssignment & {
  custom_start_time?: string | null;
  custom_end_time?: string | null;
  shift: Shift | null;
  store: Store | null;
};

function effectiveTimes(assignment: AssignmentRow): { start: string; end: string } {
  const sh = assignment.shift;
  if (!sh) return { start: '', end: '' };
  const cs = assignment.custom_start_time;
  const ce = assignment.custom_end_time;
  const start =
    cs != null && String(cs).trim() !== '' ? String(cs).split(':').slice(0, 2).join(':') : sh.start_time;
  const end =
    ce != null && String(ce).trim() !== '' ? String(ce).split(':').slice(0, 2).join(':') : sh.end_time;
  return { start, end };
}

function formatClock(value: string): string {
  const part = value.split(':').slice(0, 2);
  if (part.length < 2) return value;
  return `${part[0]!.padStart(2, '0')}:${part[1]!.padStart(2, '0')}`;
}

export default function EmployeeMonthlyReportPage() {
  const params = useParams();
  const employeeId = typeof params.employeeId === 'string' ? params.employeeId : '';

  const [monthValue, setMonthValue] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [monthTotals, setMonthTotals] = useState<ReturnType<typeof getEmployeeMonthlyHourTotals> | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { year, monthIndex, monthStart, monthEnd } = useMemo(() => {
    const [y, m] = monthValue.split('-').map(Number);
    const year = y || new Date().getFullYear();
    const monthIndex = (m || 1) - 1;
    const first = new Date(year, monthIndex, 1);
    const last = new Date(year, monthIndex + 1, 0);
    return {
      year,
      monthIndex,
      monthStart: formatDate(first),
      monthEnd: formatDate(last),
    };
  }, [monthValue]);

  const calendarDays = useMemo(() => getDaysInMonth(year, monthIndex), [year, monthIndex]);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    setError(null);
    try {
      const [empRes, assignRes, vacRes] = await Promise.all([
        supabase.from('employees').select('*').eq('id', employeeId).maybeSingle(),
        supabase
          .from('shift_assignments')
          .select('*, shift:shifts(*), store:stores(*)')
          .eq('employee_id', employeeId)
          .gte('date', monthStart)
          .lte('date', monthEnd)
          .order('date'),
        supabase
          .from('vacations')
          .select('*')
          .eq('employee_id', employeeId)
          .lte('start_date', monthEnd)
          .gte('end_date', monthStart),
      ]);

      if (empRes.error) throw empRes.error;
      if (assignRes.error) throw assignRes.error;
      if (vacRes.error) throw vacRes.error;

      setEmployee(empRes.data as Employee | null);
      const rawAssign = (assignRes.data || []) as AssignmentRow[];
      setAssignments(rawAssign);
      const vacs = (vacRes.data || []) as Vacation[];
      setVacations(vacs);

      const plannerRows = rawAssign as PlannerShiftAssignmentRow[];
      setMonthTotals(getEmployeeMonthlyHourTotals(employeeId, monthStart, plannerRows, vacs));
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
      setMonthTotals(null);
    } finally {
      setLoading(false);
    }
  }, [employeeId, monthStart, monthEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      void load();
    };
    window.addEventListener(PLANNER_ASSIGNMENTS_CHANGED, handler);
    return () => window.removeEventListener(PLANNER_ASSIGNMENTS_CHANGED, handler);
  }, [load]);

  const vacationOnDate = useCallback(
    (dateStr: string) =>
      vacations.some(
        (v) => v.employee_id === employeeId && isDateInVacation(dateStr, v.start_date, v.end_date)
      ),
    [vacations, employeeId]
  );

  const assignmentByDate = useMemo(() => {
    const m = new Map<string, AssignmentRow>();
    for (const a of assignments) {
      m.set(a.date, a);
    }
    return m;
  }, [assignments]);

  type TableRow =
    | { kind: 'vacation'; date: string }
    | { kind: 'work'; date: string; assignment: AssignmentRow };

  const tableRows = useMemo(() => {
    const rows: TableRow[] = [];
    for (const d of calendarDays) {
      const ds = formatDate(d);
      if (vacationOnDate(ds)) {
        rows.push({ kind: 'vacation', date: ds });
        continue;
      }
      const a = assignmentByDate.get(ds);
      if (a) rows.push({ kind: 'work', date: ds, assignment: a });
    }
    return rows;
  }, [calendarDays, vacationOnDate, assignmentByDate]);

  if (!employeeId) {
    return (
      <AuthGuard>
        <Layout>
          <p className="text-sm text-red-600">Invalid employee.</p>
        </Layout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <Layout>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Monthly employee report
              </h1>
              {employee ? (
                <p className="mt-1 text-lg font-semibold text-gray-800">
                  {employee.name}
                </p>
              ) : !loading ? (
                <p className="mt-1 text-sm text-amber-700">Employee not found.</p>
              ) : null}
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                Month
              </label>
              <input
                type="month"
                value={monthValue}
                onChange={(e) => setMonthValue(e.target.value)}
                className="mt-1 rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900"
              />
            </div>
          </div>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          {monthTotals ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <p className="mb-2 font-semibold text-gray-900">Month totals (planner — effective = Schicht − Pause)</p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 lg:grid-cols-5">
                <div>
                  <dt className="text-gray-500">Effective hours (payroll base)</dt>
                  <dd className="font-medium tabular-nums">{formatWorkHoursDisplay(monthTotals.total_hours)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Night share (info)</dt>
                  <dd className="font-medium tabular-nums">{formatWorkHoursDisplay(monthTotals.night_hours)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Sunday share (info)</dt>
                  <dd className="font-medium tabular-nums">{formatWorkHoursDisplay(monthTotals.sunday_hours)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Vacation days</dt>
                  <dd className="font-medium tabular-nums">{monthTotals.vacation_days}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Sick days</dt>
                  <dd className="font-medium tabular-nums">{monthTotals.sick_days}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-gray-500">
                Night and Sunday values are informational splits only; they are not added on top of effective
                hours.
              </p>
            </div>
          ) : null}

          {loading ? (
            <p className="text-center text-gray-600">Loading…</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                      Date
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                      Store
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                      Shift code
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">
                      Start
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">
                      End
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">
                      Effective (h)
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">
                      Night (info)
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">
                      Sunday (info)
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tableRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-3 py-6 text-center text-gray-500"
                      >
                        No assignments or vacation days in this month.
                      </td>
                    </tr>
                  ) : (
                    tableRows.map((row) => {
                      if (row.kind === 'vacation') {
                        return (
                          <tr key={`v-${row.date}`} className="bg-green-50/50">
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-900">
                              {row.date}
                            </td>
                            <td className="px-3 py-2 text-gray-400">—</td>
                            <td className="px-3 py-2 text-gray-400">—</td>
                            <td className="px-3 py-2 text-right text-gray-400">—</td>
                            <td className="px-3 py-2 text-right text-gray-400">—</td>
                            <td className="px-3 py-2 text-right text-gray-400">—</td>
                            <td className="px-3 py-2 text-right text-gray-400">—</td>
                            <td className="px-3 py-2 text-right text-gray-400">—</td>
                            <td className="px-3 py-2 font-medium text-green-800">
                              Vacation
                            </td>
                          </tr>
                        );
                      }

                      const { assignment } = row;
                      const sh = assignment.shift;
                      const st = assignment.store;
                      const { start, end } = effectiveTimes(assignment);
                      const isShift = (assignment.assignment_type ?? 'SHIFT') === 'SHIFT' && sh;
                      const buckets = isShift ? assignmentHourBuckets({ ...assignment, shift: sh }) : null;
                      const effectiveH = isShift ? calculateEmployeeHours({ ...assignment, shift: sh }) : null;
                      const status =
                        (assignment.assignment_type ?? 'SHIFT') === 'KRANK' || (sh && isKrankShiftName(sh.name))
                          ? 'Sick'
                          : 'Normal';

                      return (
                        <tr key={row.date} className="hover:bg-gray-50">
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-900">
                            {row.date}
                          </td>
                          <td className="max-w-[140px] truncate px-3 py-2 text-gray-800">
                            {st?.name ?? '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">
                            {sh?.name ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                            {start ? formatClock(start) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                            {end ? formatClock(end) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-800">
                            {effectiveH != null && effectiveH > 0 ? formatWorkHoursDisplay(effectiveH) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-800">
                            {buckets ? formatWorkHoursDisplay(buckets.nightHours) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-800">
                            {buckets ? formatWorkHoursDisplay(buckets.sundayHours) : '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-800">{status}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {monthTotals && tableRows.length > 0 ? (
                  <tfoot className="border-t-2 border-gray-300 bg-gray-100">
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-700"
                      >
                        Month totals (planner)
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-gray-900">
                        {formatWorkHoursDisplay(monthTotals.total_hours)}
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-gray-900">
                        {formatWorkHoursDisplay(monthTotals.night_hours)}
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-gray-900">
                        {formatWorkHoursDisplay(monthTotals.sunday_hours)}
                      </td>
                      <td className="px-3 py-2 text-gray-400">—</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          )}
        </div>
      </Layout>
    </AuthGuard>
  );
}
