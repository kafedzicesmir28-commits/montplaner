'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { supabase } from '@/lib/supabaseClient';
import { calculateEmployeeHours } from '@/lib/hoursCalculator';
import { PLANNER_ASSIGNMENTS_CHANGED } from '@/lib/plannerEvents';
import { formatDate, formatErrorMessage, formatWorkHoursDisplay } from '@/lib/utils';
import { t } from '@/lib/translations';
import type { Employee, Shift, ShiftAssignment, Store } from '@/types/database';

type AssignmentRow = ShiftAssignment & {
  custom_start_time?: string | null;
  custom_end_time?: string | null;
  shift: Shift | null;
  store: Store | null;
};

type RowView = {
  id: string;
  date: string;
  storeName: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  workedHours: number;
};

function formatClock(value: string): string {
  const part = value.split(':').slice(0, 2);
  if (part.length < 2) return value;
  return `${part[0]!.padStart(2, '0')}:${part[1]!.padStart(2, '0')}`;
}

function yearOptions(): number[] {
  const list: number[] = [];
  for (let y = 2018; y <= 2040; y++) list.push(y);
  return list;
}

const MONTH_INDEXES = Array.from({ length: 12 }, (_, i) => i);

export default function EmployeeMonthlyReport() {
  const { companyId } = useCompany();
  const now = new Date();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<RowView[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromDate = useMemo(() => formatDate(new Date(selectedYear, selectedMonth, 1)), [selectedYear, selectedMonth]);
  const toDate = useMemo(() => formatDate(new Date(selectedYear, selectedMonth + 1, 0)), [selectedYear, selectedMonth]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId],
  );

  const periodLabel = useMemo(() => {
    const d = new Date(selectedYear, selectedMonth, 1);
    return d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  }, [selectedYear, selectedMonth]);

  const loadEmployees = useCallback(async () => {
    setLoadingEmployees(true);
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
      const list = (data || []) as Employee[];
      setEmployees(list);
      if (list.length > 0) {
        setSelectedEmployeeId((prev) => prev || list[0]!.id);
      }
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
      setEmployees([]);
    } finally {
      setLoadingEmployees(false);
    }
  }, [companyId]);

  const loadAssignments = useCallback(async () => {
    if (!selectedEmployeeId) {
      setRows([]);
      return;
    }

    setLoadingRows(true);
    setError(null);

    try {
      if (!companyId) {
        setRows([]);
        return;
      }
      const { data, error } = await supabase
        .from('shift_assignments')
        .select('*, shift:shifts(*), store:stores(*)')
        .eq('company_id', companyId)
        .eq('employee_id', selectedEmployeeId)
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date', { ascending: true });

      if (error) throw error;

      const raw = (data || []) as AssignmentRow[];
      const mapped = raw
        .filter((a) => (a.assignment_type ?? 'SHIFT') === 'SHIFT' && a.shift)
        .map((a) => {
          const shift = a.shift!;
          const worked = calculateEmployeeHours({ ...a, shift });
          const start =
            a.custom_start_time != null && String(a.custom_start_time).trim() !== ''
              ? String(a.custom_start_time).split(':').slice(0, 2).join(':')
              : shift.start_time;
          const end =
            a.custom_end_time != null && String(a.custom_end_time).trim() !== ''
              ? String(a.custom_end_time).split(':').slice(0, 2).join(':')
              : shift.end_time;

          return {
            id: a.id,
            date: a.date,
            storeName: a.store?.name ?? '—',
            shiftName: shift.name ?? '—',
            startTime: start ? formatClock(start) : '—',
            endTime: end ? formatClock(end) : '—',
            workedHours: worked,
          } satisfies RowView;
        });

      setRows(mapped);
    } catch (e: unknown) {
      setError(formatErrorMessage(e));
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  }, [selectedEmployeeId, fromDate, toDate, companyId]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    if (loadingEmployees) return;
    void loadAssignments();
  }, [loadingEmployees, loadAssignments]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      void loadAssignments();
    };
    window.addEventListener(PLANNER_ASSIGNMENTS_CHANGED, handler);
    return () => window.removeEventListener(PLANNER_ASSIGNMENTS_CHANGED, handler);
  }, [loadAssignments]);

  const totalShifts = rows.length;
  const totalWorkedHours = useMemo(() => rows.reduce((sum, row) => sum + row.workedHours, 0), [rows]);

  const formatDateDe = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    if (!y || !m || !d) return ymd;
    return new Date(y, m - 1, d).toLocaleDateString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const generatedLabel = useMemo(() => {
    return new Date().toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  return (
    <div className="employee-monthly-report space-y-6 print:max-w-none print:space-y-4">
      {/* Print-only title block */}
      <div className="hidden print:block print:border-b print:border-gray-300 print:pb-4">
        <h1 className="text-xl font-bold text-gray-900">{t.employeeMonthlyTitle}</h1>
        <p className="mt-1 text-sm text-gray-700">
          <span className="font-semibold">{selectedEmployee?.name ?? '—'}</span>
          <span className="mx-2 text-gray-400">·</span>
          <span>{periodLabel}</span>
        </p>
        <p className="mt-3 text-base font-semibold text-gray-900">
          {t.employeeMonthlyTotalWorkedHours}:{' '}
          <span className="tabular-nums">{formatWorkHoursDisplay(totalWorkedHours)}</span>
        </p>
        <p className="mt-1 text-sm text-gray-600">
          {t.employeeMonthlyShiftCount}: {totalShifts}
        </p>
        <p className="mt-2 text-xs text-gray-500">
          {t.employeeMonthlyGenerated}: {generatedLabel}
        </p>
      </div>

      <header className="space-y-1 print:hidden">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t.employeeMonthlyTitle}</h1>
        <p className="text-sm text-gray-600">{t.employeeMonthlySubtitle}</p>
      </header>

      <section className="flex flex-col gap-4 print:hidden sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600">{t.employee}</span>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              disabled={loadingEmployees || employees.length === 0}
            >
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600">{t.reportsMonth}</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            >
              {MONTH_INDEXES.map((index) => {
                const label = new Date(2000, index, 1).toLocaleDateString('de-DE', { month: 'long' });
                return (
                  <option key={index} value={index}>
                    {label}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="space-y-1">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600">{t.year}</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            >
              {yearOptions().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
        >
          <Printer className="h-4 w-4" aria-hidden />
          {t.employeeMonthlyPrint}
        </button>
      </section>

      {/* Screen overview card */}
      <section
        className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-5 shadow-sm print:hidden"
        aria-labelledby="employee-monthly-overview-heading"
      >
        <h2 id="employee-monthly-overview-heading" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t.employeeMonthlyOverview}
        </h2>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-lg font-semibold text-gray-900">{selectedEmployee?.name ?? '—'}</p>
            <p className="text-sm text-gray-600">
              {t.employeeMonthlyPeriod}: {periodLabel}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t.employeeMonthlyTotalWorkedHours}</p>
            <p className="text-3xl font-bold tabular-nums tracking-tight text-gray-900">
              {formatWorkHoursDisplay(totalWorkedHours)}
            </p>
            <p className="mt-1 text-sm text-gray-600">
              {t.employeeMonthlyShiftCount}: <span className="tabular-nums font-medium text-gray-900">{totalShifts}</span>
            </p>
          </div>
        </div>
      </section>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 print:hidden">{error}</p>
      ) : null}

      <section className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm print:rounded-none print:border print:shadow-none">
        <table className="min-w-full divide-y divide-gray-200 text-sm print:text-[11px]">
          <thead className="bg-gray-50 print:bg-white">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600 print:border-b print:border-gray-400">
                {t.employeeMonthlyDateColumn}
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600 print:border-b print:border-gray-400">
                {t.reportsStore}
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600 print:border-b print:border-gray-400">
                {t.employeeMonthlyShiftName}
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600 print:border-b print:border-gray-400">
                {t.employeeMonthlyStartTime}
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600 print:border-b print:border-gray-400">
                {t.employeeMonthlyEndTime}
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600 print:border-b print:border-gray-400">
                {t.employeeMonthlyHoursPerDay}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loadingRows ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  {t.loading}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  {t.employeeMonthlyNoShifts}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  key={row.id}
                  className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} print:break-inside-avoid print:bg-white`}
                >
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-900">{formatDateDe(row.date)}</td>
                  <td className="px-3 py-2 text-gray-800">{row.storeName}</td>
                  <td className="px-3 py-2 text-gray-800">{row.shiftName}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{row.startTime}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{row.endTime}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">
                    {formatWorkHoursDisplay(row.workedHours)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="border-t-2 border-gray-300 bg-gray-100 print:border-t-2 print:border-gray-900 print:bg-white">
            <tr>
              <td colSpan={3} className="px-3 py-3 text-sm font-semibold text-gray-800 print:py-2">
                {t.employeeMonthlyShiftCount}: <span className="tabular-nums">{totalShifts}</span>
              </td>
              <td colSpan={3} className="px-3 py-3 text-right text-sm font-semibold text-gray-900 print:py-2">
                {t.employeeMonthlyTotalWorkedHours}:{' '}
                <span className="tabular-nums text-base print:text-sm">
                  {formatWorkHoursDisplay(totalWorkedHours)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}
