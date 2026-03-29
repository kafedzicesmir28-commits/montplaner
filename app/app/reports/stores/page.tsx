'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabaseClient';
import { assignmentTotalWorkHours } from '@/lib/reportsAnalytics';
import { formatDate, formatErrorMessage, parseYmdLocal } from '@/lib/utils';
import { resolveStoreColor } from '@/lib/storeColors';
import type { Employee, Shift, ShiftAssignment, Store } from '@/types/database';
import { t } from '@/lib/translations';

type StoreRow = Store & { color?: string | null };

type AssignRow = ShiftAssignment & {
  custom_start_time?: string | null;
  custom_end_time?: string | null;
  shift?: Shift | null;
  employee?: Employee | Employee[] | null;
};

function formatPeriodLabel(startYmd: string, endYmd: string): string {
  const s = parseYmdLocal(startYmd);
  const e = parseYmdLocal(endYmd);
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
  return `${s.toLocaleDateString('de-DE', opts)} – ${e.toLocaleDateString('de-DE', opts)}`;
}

function formatHours(value: number): string {
  return value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function resolveEmployee(row: AssignRow): Employee | null {
  const e = row.employee;
  if (e == null) return null;
  return Array.isArray(e) ? e[0] ?? null : e;
}

type EmployeeHours = { employeeId: string; name: string; hours: number };

export default function StoreOverviewPage() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return formatDate(d);
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 0);
    return formatDate(d);
  });

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [assignments, setAssignments] = useState<AssignRow[]>([]);
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
      setLoading(false);
      return;
    }
    try {
      const [storesRes, assignRes] = await Promise.all([
        supabase.from('stores').select('*').order('name', { ascending: true }),
        supabase
          .from('shift_assignments')
          .select('*, shift:shifts(*), employee:employees(*)')
          .gte('date', startDate)
          .lte('date', endDate),
      ]);
      if (storesRes.error) throw storesRes.error;
      if (assignRes.error) throw assignRes.error;
      setStores((storesRes.data || []) as StoreRow[]);
      setAssignments((assignRes.data || []) as AssignRow[]);
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
      setStores([]);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, rangeInvalid]);

  useEffect(() => {
    void load();
  }, [load]);

  const storeSections = useMemo(() => {
    const empHoursByStore = new Map<string, Map<string, { name: string; hours: number }>>();
    let grandTotal = 0;

    for (const row of assignments) {
      if ((row.assignment_type ?? 'SHIFT') !== 'SHIFT') continue;
      const sid = row.store_id;
      if (!sid) continue;
      const h = assignmentTotalWorkHours(row);
      if (h <= 0) continue;
      const emp = resolveEmployee(row);
      const empId = row.employee_id;
      const name = emp?.name?.trim() || '—';
      grandTotal += h;

      if (!empHoursByStore.has(sid)) empHoursByStore.set(sid, new Map());
      const inner = empHoursByStore.get(sid)!;
      const cur = inner.get(empId) ?? { name, hours: 0 };
      cur.hours += h;
      cur.name = name;
      inner.set(empId, cur);
    }

    return stores.map((store) => {
      const inner = empHoursByStore.get(store.id);
      const employees: EmployeeHours[] = inner
        ? [...inner.entries()].map(([employeeId, v]) => ({
            employeeId,
            name: v.name,
            hours: v.hours,
          }))
        : [];
      employees.sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
      const totalHours = employees.reduce((s, e) => s + e.hours, 0);
      return { store, employees, totalHours };
    });
  }, [stores, assignments]);

  const grandTotalHours = useMemo(
    () => storeSections.reduce((s, sec) => s + sec.totalHours, 0),
    [storeSections],
  );

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
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">{t.storeOverviewTitle}</h1>
              <p className="mt-2 max-w-3xl text-sm text-gray-600">{t.storeOverviewSubtitle}</p>
              <p className="mt-2 text-sm font-medium text-gray-800">
                {t.storeOverviewPeriod}: {periodLabel}
              </p>
              {rangeInvalid && (
                <p className="mt-2 text-sm text-red-600">{t.reportsInvalidRange}</p>
              )}
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

          {!rangeInvalid && (
            <>
              <section className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 sm:px-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t.storeOverviewGrandTotalHours}
                </p>
                <p className="text-2xl font-bold tabular-nums text-gray-900">{formatHours(grandTotalHours)} h</p>
              </section>

              <div className="space-y-6">
                {storeSections.map(({ store, employees, totalHours }) => {
                  const accent = resolveStoreColor(store.color ?? undefined);
                  return (
                    <section
                      key={store.id}
                      className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                    >
                      <div
                        className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                        style={{ borderLeftWidth: 4, borderLeftColor: accent }}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: accent }}
                            aria-hidden
                          />
                          <h2 className="text-lg font-semibold text-gray-900">{store.name}</h2>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                          <div className="text-right">
                            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                              {t.storeOverviewHoursAtLocation}
                            </p>
                            <p className="text-xl font-bold tabular-nums text-gray-900">{formatHours(totalHours)} h</p>
                          </div>
                          <Link
                            href={`/reports/stores/${store.id}`}
                            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
                          >
                            {t.storeOverviewDetailReport}
                          </Link>
                        </div>
                      </div>

                      <div className="px-4 py-3 sm:px-5">
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                          {t.storeOverviewEmployeesAtLocation}
                        </h3>
                        {employees.length === 0 ? (
                          <p className="text-sm text-gray-500">{t.storeOverviewNoShiftsInStore}</p>
                        ) : (
                          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                            {employees.map((e) => (
                              <li
                                key={e.employeeId}
                                className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm first:rounded-t-lg last:rounded-b-lg odd:bg-gray-50/80"
                              >
                                <span className="font-medium text-gray-900">{e.name}</span>
                                <span className="tabular-nums text-gray-700">{formatHours(e.hours)} h</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>

              {stores.length === 0 && (
                <p className="text-center text-sm text-gray-500">{t.noDataForDateRange}</p>
              )}
            </>
          )}
        </div>
      </Layout>
    </AuthGuard>
  );
}
