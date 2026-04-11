'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabaseClient';
import type { Employee, Vacation } from '@/types/database';
import { formatErrorMessage } from '@/lib/utils';

function parseYmd(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/** Inclusive calendar days from start_date through end_date (YYYY-MM-DD). */
function vacationInclusiveDays(startDate: string, endDate: string): number {
  const start = parseYmd(startDate);
  const end = parseYmd(endDate);
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return diff + 1;
}

type VacationWithDays = Vacation & { dayCount: number };

export default function EmployeeVacationReportPage() {
  const params = useParams();
  const employeeId = typeof params.employeeId === 'string' ? params.employeeId : '';

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [vacations, setVacations] = useState<VacationWithDays[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    setError(null);
    try {
      const [empRes, vacRes] = await Promise.all([
        supabase.from('employees').select('*').eq('id', employeeId).maybeSingle(),
        supabase
          .from('vacations')
          .select('*')
          .eq('employee_id', employeeId)
          .order('start_date', { ascending: true }),
      ]);

      if (empRes.error) throw empRes.error;
      if (vacRes.error) throw vacRes.error;

      setEmployee(empRes.data as Employee | null);
      const rows = (vacRes.data || []) as Vacation[];
      setVacations(
        rows.map((v) => ({
          ...v,
          dayCount: vacationInclusiveDays(v.start_date, v.end_date),
        }))
      );
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
      setVacations([]);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const timelineRange = (() => {
    if (vacations.length === 0) return null;
    let min = parseYmd(vacations[0]!.start_date);
    let max = parseYmd(vacations[0]!.end_date);
    for (const v of vacations) {
      const s = parseYmd(v.start_date);
      const e = parseYmd(v.end_date);
      if (s < min) min = s;
      if (e > max) max = e;
    }
    const totalDays = Math.max(1, Math.round((max.getTime() - min.getTime()) / 86400000) + 1);
    return { min, max, totalDays };
  })();

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
        <div className="mx-auto max-w-4xl space-y-8">
          <header>
            <h1 className="text-2xl font-bold text-gray-900">
              Vacation overview
            </h1>
            {employee ? (
              <p className="mt-2 text-lg font-semibold text-gray-800">
                {employee.name}
              </p>
            ) : !loading ? (
              <p className="mt-2 text-sm text-amber-700">Employee not found.</p>
            ) : null}
            <p className="mt-1 text-sm text-gray-500">
              All vacation periods (read-only). Ordered by start date.
            </p>
          </header>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          {loading ? (
            <p className="text-center text-gray-600">Loading…</p>
          ) : vacations.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-gray-600">
              No vacation records for this employee.
            </p>
          ) : (
            <>
              <section aria-label="Vacation timeline">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">
                  Timeline
                </h2>
                {timelineRange ? (
                  <div className="space-y-3">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{timelineRange.min.toLocaleDateString()}</span>
                      <span>{timelineRange.max.toLocaleDateString()}</span>
                    </div>
                    <div className="relative h-14 w-full overflow-hidden rounded-lg bg-gray-100">
                      {vacations.map((v, i) => {
                        const s = parseYmd(v.start_date);
                        const e = parseYmd(v.end_date);
                        const offsetStart = Math.round(
                          (s.getTime() - timelineRange.min.getTime()) / 86400000
                        );
                        const spanDays = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
                        const leftPct = (offsetStart / timelineRange.totalDays) * 100;
                        const widthPct = Math.max((spanDays / timelineRange.totalDays) * 100, 0.8);
                        const hue = (i * 47) % 360;
                        return (
                          <div
                            key={v.id}
                            className="absolute top-1 bottom-1 flex min-w-[4px] items-center justify-center rounded-md px-1 text-[10px] font-medium text-white shadow-sm"
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              backgroundColor: `hsl(${hue} 55% 42%)`,
                            }}
                            title={`${v.start_date} → ${v.end_date} (${v.dayCount} days)`}
                          />
                        );
                      })}
                    </div>
                    <ul className="flex flex-wrap gap-3 text-xs text-gray-600">
                      {vacations.map((v, i) => {
                        const hue = (i * 47) % 360;
                        return (
                          <li key={v.id} className="flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                              style={{ backgroundColor: `hsl(${hue} 55% 42%)` }}
                            />
                            <span>
                              {v.start_date} – {v.end_date}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </section>

              <section aria-label="Vacation table">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">
                  Details
                </h2>
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">
                          Start date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">
                          End date
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">
                          Total days
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {vacations.map((v) => (
                        <tr
                          key={v.id}
                          className="hover:bg-gray-50"
                        >
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-900">
                            {v.start_date}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-900">
                            {v.end_date}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-gray-900">
                            {v.dayCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
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
