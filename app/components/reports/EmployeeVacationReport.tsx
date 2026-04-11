'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/lib/supabaseClient';
import { formatErrorMessage, parseYmdLocal } from '@/lib/utils';
import { t } from '@/lib/translations';
import type { Employee, Vacation } from '@/types/database';

const FILTER_ALL = '__all__';

type VacationWithEmployee = Vacation & {
  employee?: Employee | Employee[] | null;
};

function vacationInclusiveDays(startDate: string, endDate: string): number {
  const start = parseYmdLocal(startDate);
  const end = parseYmdLocal(endDate);
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return diff + 1;
}

function formatDateDE(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function absencePeriodLabel(startDate: string, endDate: string): string {
  return `${formatDateDE(startDate)} – ${formatDateDE(endDate)}`;
}

type VacationPhase = 'current' | 'past' | 'upcoming';

function vacationPhase(startDate: string, endDate: string): VacationPhase {
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = parseYmdLocal(startDate);
  const end = parseYmdLocal(endDate);
  if (today0 > end) return 'past';
  if (today0 < start) return 'upcoming';
  return 'current';
}

function resolveEmployee(row: VacationWithEmployee): Employee | null {
  const e = row.employee;
  if (e == null) return null;
  return Array.isArray(e) ? e[0] ?? null : e;
}

export default function EmployeeVacationReport() {
  const { companyId } = useCompany();
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>(FILTER_ALL);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<VacationWithEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showEmployeeColumn = filterEmployeeId === FILTER_ALL;

  const selectedEmployee = useMemo(
    () => (filterEmployeeId === FILTER_ALL ? null : employees.find((e) => e.id === filterEmployeeId) ?? null),
    [employees, filterEmployeeId],
  );

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!companyId) {
        setEmployees([]);
        return;
      }
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('company_id', companyId)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });
      if (error) throw error;
      setEmployees((data || []) as Employee[]);
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const loadVacations = useCallback(async () => {
    setLoadingRows(true);
    setError(null);
    try {
      if (!companyId) {
        setRows([]);
        return;
      }
      let q = supabase
        .from('vacations')
        .select('*, employee:employees(*)')
        .eq('company_id', companyId)
        .order('start_date', { ascending: false });

      if (filterEmployeeId !== FILTER_ALL) {
        q = q.eq('employee_id', filterEmployeeId);
      }

      const { data, error } = await q;
      if (error) throw error;
      setRows((data || []) as VacationWithEmployee[]);
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  }, [filterEmployeeId, companyId]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    if (loading) return;
    void loadVacations();
  }, [loading, loadVacations]);

  const totalCalendarDays = useMemo(
    () => rows.reduce((sum, row) => sum + vacationInclusiveDays(row.start_date, row.end_date), 0),
    [rows],
  );

  const statusBadge = (phase: VacationPhase) => {
    const styles: Record<VacationPhase, string> = {
      current: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200',
      upcoming: 'bg-sky-100 text-sky-900 ring-1 ring-sky-200',
      past: 'bg-gray-100 text-gray-700 ring-1 ring-gray-200',
    };
    const labels: Record<VacationPhase, string> = {
      current: t.vacationStatusCurrent,
      upcoming: t.vacationStatusUpcoming,
      past: t.vacationStatusPast,
    };
    return (
      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[phase]}`}>
        {labels[phase]}
      </span>
    );
  };

  const colCount = showEmployeeColumn ? 6 : 5;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t.employeeVacationReportTitle}</h1>
        <p className="text-sm text-gray-600">{t.employeeVacationReportSubtitle}</p>
      </header>

      <section className="max-w-xl">
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600">{t.filterByEmployee}</span>
          <select
            value={filterEmployeeId}
            onChange={(e) => setFilterEmployeeId(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            disabled={loading}
          >
            <option value={FILTER_ALL}>{t.filterAllEmployees}</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </label>
        {selectedEmployee ? (
          <p className="mt-2 text-sm text-gray-600">
            <span className="font-medium text-gray-900">{selectedEmployee.name}</span>
            <span className="text-gray-500"> — {t.employeeVacationReportTitle}</span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-gray-600">
            <span className="font-medium text-gray-900">{t.filterAllEmployees}</span>
            <span className="text-gray-500">
              {' '}
              · {rows.length} {t.vacationEntriesCount}
            </span>
          </p>
        )}
      </section>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <section className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {showEmployeeColumn ? (
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">{t.employeeName}</th>
              ) : null}
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">{t.absencePeriod}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">{t.absenceFrom}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">{t.absenceTo}</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">{t.calendarDays}</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">{t.status}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loadingRows ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-6 text-center text-gray-500">
                  {t.loading}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-6 text-center text-gray-500">
                  {t.noVacationEntries}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const emp = resolveEmployee(row);
                const phase = vacationPhase(row.start_date, row.end_date);
                const activeRow = phase === 'current';
                return (
                  <tr key={row.id} className={activeRow ? 'bg-emerald-50/80' : undefined}>
                    {showEmployeeColumn ? (
                      <td className="px-3 py-2 font-medium text-gray-900">{emp?.name ?? '—'}</td>
                    ) : null}
                    <td className="max-w-[min(28rem,55vw)] px-3 py-2 text-gray-800">
                      {absencePeriodLabel(row.start_date, row.end_date)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-800">{formatDateDE(row.start_date)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-800">{formatDateDE(row.end_date)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">
                      {vacationInclusiveDays(row.start_date, row.end_date)}
                    </td>
                    <td className="px-3 py-2">{statusBadge(phase)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-gray-200 bg-gray-50">
              <tr>
                <td
                  colSpan={showEmployeeColumn ? 4 : 3}
                  className="px-3 py-3 text-sm font-semibold text-gray-800"
                >
                  {t.vacationTotalDaysListed}
                </td>
                <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-gray-900">{totalCalendarDays}</td>
                <td className="px-3 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </section>
    </div>
  );
}
