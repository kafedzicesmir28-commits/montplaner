'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabaseClient';
import { assignmentTotalWorkHours, paidWorkHoursFromRpcBuckets } from '@/lib/reportsAnalytics';
import { formatDate, formatErrorMessage, monthsFirstOfMonthInRange, parseYmdLocal } from '@/lib/utils';
import { resolveStoreColor } from '@/lib/storeColors';
import type { Employee, Shift, ShiftAssignment, Store } from '@/types/database';
import { t } from '@/lib/translations';
import { BarChart3 } from 'lucide-react';

type AssignRow = ShiftAssignment & {
  custom_start_time?: string | null;
  custom_end_time?: string | null;
  shift?: Shift | null;
};

type RpcBuckets = {
  normal_hours: number;
  night_hours: number;
  sunday_hours: number;
};

function formatPeriodLabel(startYmd: string, endYmd: string): string {
  const s = parseYmdLocal(startYmd);
  const e = parseYmdLocal(endYmd);
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
  return `${s.toLocaleDateString('de-DE', opts)} – ${e.toLocaleDateString('de-DE', opts)}`;
}

function formatCurrencyEUR(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

function formatHours(value: number): string {
  return value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  if (!y || !m) return yyyyMm;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

export default function ReportsHubPage() {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(1);
    return formatDate(date);
  });
  const [endDate, setEndDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1, 0);
    return formatDate(date);
  });

  const [stores, setStores] = useState<Store[]>([]);
  const [assignments, setAssignments] = useState<AssignRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeMonthPaid, setEmployeeMonthPaid] = useState<Map<string, Map<string, number>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rangeInvalid = parseYmdLocal(endDate) < parseYmdLocal(startDate);
  const periodLabel = useMemo(() => formatPeriodLabel(startDate, endDate), [startDate, endDate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (rangeInvalid) {
      setStores([]);
      setAssignments([]);
      setEmployees([]);
      setEmployeeMonthPaid(new Map());
      setLoading(false);
      return;
    }

    const months = monthsFirstOfMonthInRange(startDate, endDate);

    try {
      const [storesRes, employeesRes, assignRes] = await Promise.all([
        supabase.from('stores').select('*').order('name'),
        supabase
          .from('employees')
          .select('*')
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('name', { ascending: true }),
        supabase
          .from('shift_assignments')
          .select('*, shift:shifts(*)')
          .gte('date', startDate)
          .lte('date', endDate),
      ]);

      if (storesRes.error) throw storesRes.error;
      if (employeesRes.error) throw employeesRes.error;
      if (assignRes.error) throw assignRes.error;

      const listEmployees = (employeesRes.data || []) as Employee[];
      setStores((storesRes.data || []) as Store[]);
      setEmployees(listEmployees);
      setAssignments((assignRes.data || []) as AssignRow[]);

      const paidMap = new Map<string, Map<string, number>>();

      for (const pMonth of months) {
        const monthKey = pMonth.slice(0, 7);
        await Promise.all(
          listEmployees.map(async (emp) => {
            const { data, error: rpcError } = await supabase.rpc('calculate_employee_hours', {
              p_employee_id: emp.id,
              p_month: pMonth,
            });
            if (rpcError) throw rpcError;
            const rpc = (Array.isArray(data) ? data[0] : data) as RpcBuckets | null | undefined;
            const paid = rpc ? paidWorkHoursFromRpcBuckets(rpc) : 0;
            if (!paidMap.has(emp.id)) paidMap.set(emp.id, new Map());
            paidMap.get(emp.id)!.set(monthKey, paid);
          }),
        );
      }

      setEmployeeMonthPaid(paidMap);
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
      setStores([]);
      setAssignments([]);
      setEmployees([]);
      setEmployeeMonthPaid(new Map());
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, rangeInvalid]);

  useEffect(() => {
    void load();
  }, [load]);

  const shiftAssignmentRows = useMemo(
    () => assignments.filter((a) => (a.assignment_type ?? 'SHIFT') === 'SHIFT'),
    [assignments],
  );

  const { totalAssignmentHours, storeHoursMap, unassignedHours, monthRows } = useMemo(() => {
    const storeHoursMap = new Map<string, number>();
    let unassignedHours = 0;
    let totalAssignmentHours = 0;
    const monthKeysOrdered = monthsFirstOfMonthInRange(startDate, endDate).map((p) => p.slice(0, 7));
    const monthMap = new Map<string, { hours: number; shiftRows: number }>();
    for (const mk of monthKeysOrdered) {
      monthMap.set(mk, { hours: 0, shiftRows: 0 });
    }

    for (const row of assignments) {
      const monthKey = row.date.slice(0, 7);
      const cur = monthMap.get(monthKey);
      if (!cur) continue;

      if ((row.assignment_type ?? 'SHIFT') === 'SHIFT') cur.shiftRows += 1;

      const h = assignmentTotalWorkHours(row);
      if (h > 0) {
        totalAssignmentHours += h;
        cur.hours += h;
        const sid = row.store_id;
        if (!sid) unassignedHours += h;
        else storeHoursMap.set(sid, (storeHoursMap.get(sid) || 0) + h);
      }
      monthMap.set(monthKey, cur);
    }

    const monthRows = monthKeysOrdered.map((key) => ({
      monthKey: key,
      ...(monthMap.get(key) || { hours: 0, shiftRows: 0 }),
    }));

    return { totalAssignmentHours, storeHoursMap, unassignedHours, monthRows };
  }, [assignments, startDate, endDate]);

  const storeRows = useMemo(() => {
    const total = totalAssignmentHours > 0 ? totalAssignmentHours : 1;
    return stores.map((s) => {
      const h = storeHoursMap.get(s.id) || 0;
      return {
        store: s,
        hours: h,
        pct: totalAssignmentHours > 0 ? (h / total) * 100 : 0,
      };
    });
  }, [stores, storeHoursMap, totalAssignmentHours]);

  const employeeCostRows = useMemo(() => {
    const rows: {
      employee: Employee;
      paidHours: number;
      rate: number | null;
      cost: number | null;
    }[] = [];

    for (const emp of employees) {
      const byM = employeeMonthPaid.get(emp.id);
      let paidHours = 0;
      if (byM) {
        for (const v of byM.values()) paidHours += v;
      }
      const rate = emp.hourly_rate != null && Number.isFinite(Number(emp.hourly_rate)) ? Number(emp.hourly_rate) : null;
      const cost = rate != null ? paidHours * rate : null;
      rows.push({ employee: emp, paidHours, rate, cost });
    }

    rows.sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1) || a.employee.name.localeCompare(b.employee.name));
    return rows;
  }, [employees, employeeMonthPaid]);

  const totals = useMemo(() => {
    let estimatedPayroll = 0;
    let withRate = 0;
    for (const r of employeeCostRows) {
      if (r.cost != null) {
        estimatedPayroll += r.cost;
        withRate += 1;
      }
    }

    const monthCostMap = new Map<string, number>();
    for (const emp of employees) {
      const rate =
        emp.hourly_rate != null && Number.isFinite(Number(emp.hourly_rate)) ? Number(emp.hourly_rate) : null;
      if (rate == null) continue;
      const byM = employeeMonthPaid.get(emp.id);
      if (!byM) continue;
      for (const [mk, hrs] of byM.entries()) {
        monthCostMap.set(mk, (monthCostMap.get(mk) || 0) + hrs * rate);
      }
    }

    return { estimatedPayroll, employeesWithRate: withRate, monthCostMap };
  }, [employeeCostRows, employees, employeeMonthPaid]);

  const monthlyTable = useMemo(() => {
    return monthRows.map((m) => ({
      ...m,
      label: monthLabel(m.monthKey),
      estCost: totals.monthCostMap.get(m.monthKey) ?? 0,
    }));
  }, [monthRows, totals.monthCostMap]);

  if (loading) {
    return (
      <AuthGuard>
        <Layout>
          <div className="text-center text-gray-600">{t.loading}</div>
        </Layout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <Layout>
        <div className="space-y-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">{t.reportsTitle}</h1>
              <p className="mt-2 max-w-3xl text-sm text-gray-600">{t.reportsSubtitle}</p>
              <p className="mt-2 text-sm font-medium text-gray-800">
                {t.reportsPeriodLabel}: {periodLabel}
              </p>
              {rangeInvalid && <p className="mt-2 text-sm text-red-600">{t.reportsInvalidRange}</p>}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t.startDate}</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t.endDate}</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          )}

          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/reports/stores"
              className="rounded-md border border-gray-200 bg-white px-3 py-2 font-medium text-gray-800 hover:bg-gray-50"
            >
              {t.reportsStoreOverviewShort}
            </Link>
            <Link
              href="/reports/employee-monthly"
              className="rounded-md border border-gray-200 bg-white px-3 py-2 font-medium text-gray-800 hover:bg-gray-50"
            >
              {t.reportsEmployeeMonthlyShort}
            </Link>
            <Link
              href="/reports/employee-vacations"
              className="rounded-md border border-gray-200 bg-white px-3 py-2 font-medium text-gray-800 hover:bg-gray-50"
            >
              {t.reportsEmployeeVacationsShort}
            </Link>
          </div>

          {!rangeInvalid && (
            <>
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-gray-500">
                    <BarChart3 className="h-4 w-4" aria-hidden />
                    <span className="text-xs font-semibold uppercase tracking-wide">{t.reportsTotalHoursAllStores}</span>
                  </div>
                  <p className="mt-3 text-2xl font-bold tabular-nums text-gray-900">
                    {formatHours(totalAssignmentHours)} h
                  </p>
                  {unassignedHours > 0 && (
                    <p className="mt-1 text-xs text-amber-700">
                      {unassignedHours.toLocaleString('de-DE', { maximumFractionDigits: 2 })} h ohne Filiale
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {t.reportsShiftAssignments}
                  </p>
                  <p className="mt-3 text-2xl font-bold tabular-nums text-gray-900">{shiftAssignmentRows.length}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {t.reportsActiveEmployees}
                  </p>
                  <p className="mt-3 text-2xl font-bold tabular-nums text-gray-900">{employees.length}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {t.reportsEstimatedPayroll}
                  </p>
                  <p className="mt-3 text-2xl font-bold tabular-nums text-gray-900">
                    {formatCurrencyEUR(totals.estimatedPayroll)}
                  </p>
                  <p className="mt-2 text-xs text-gray-500">{t.reportsEstimatedPayrollHint}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {totals.employeesWithRate} / {employees.length} {t.reportsEmployeesWithRate}
                  </p>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900">{t.reportsHoursPerStore}</h2>
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                          {t.reportsStore}
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                          {t.reportsHours}
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                          {t.reportsShare}
                        </th>
                        <th className="w-40 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                          {t.reportsOpenStoreReport}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {storeRows.map(({ store, hours, pct }, i) => {
                        const dot = resolveStoreColor(store.color ?? undefined);
                        return (
                          <tr key={store.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-4 py-3 font-medium text-gray-900">
                              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: dot }} />
                              {store.name}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-800">{formatHours(hours)} h</td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                              {totalAssignmentHours > 0 ? `${pct.toFixed(1)} %` : '—'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link
                                href={`/reports/stores/${store.id}`}
                                className="text-sm font-medium text-blue-700 hover:text-blue-900"
                              >
                                {t.reportsOpenStoreReport}
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {storeRows.length === 0 && (
                      <tbody>
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                            {t.noDataForDateRange}
                          </td>
                        </tr>
                      </tbody>
                    )}
                  </table>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900">{t.reportsEmployeeCost}</h2>
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                          {t.employeeName}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                          {t.status}
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                          {t.hourlyRateLabel}
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                          {t.reportsPaidHours}
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                          {t.reportsEstimatedCost}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {employeeCostRows.map((r, i) => (
                        <tr key={r.employee.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-3 font-medium text-gray-900">{r.employee.name}</td>
                          <td className="px-4 py-3 text-gray-700">
                            {(r.employee.is_active ?? true) ? t.active : t.inactive}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                            {r.rate != null ? formatCurrencyEUR(r.rate) : t.reportsNoRate}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                            {formatHours(r.paidHours)} h
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                            {r.cost != null ? formatCurrencyEUR(r.cost) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {employeeCostRows.length === 0 && (
                      <tbody>
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                            {t.noDataForDateRange}
                          </td>
                        </tr>
                      </tbody>
                    )}
                  </table>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900">{t.reportsMonthlySummary}</h2>
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                          {t.reportsMonth}
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                          {t.reportsHours}
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                          {t.reportsAssignments}
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">
                          {t.reportsEstimatedCost}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {monthlyTable.map((m, i) => (
                        <tr key={m.monthKey} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-3 font-medium text-gray-900">{m.label}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-800">{formatHours(m.hours)} h</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-800">{m.shiftRows}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-800">
                            {m.estCost > 0 ? formatCurrencyEUR(m.estCost) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {monthlyTable.length === 0 && (
                      <tbody>
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                            {t.noDataForDateRange}
                          </td>
                        </tr>
                      </tbody>
                    )}
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </Layout>
    </AuthGuard>
  );
}
